import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
import pandas as pd

from auth import AuthUser, require_roles
from audit import log_audit
from db import SessionLocal
from models import (
    ApprovalRequest,
    AuditLog,
    BankStoreMaster,
    CanonicalTransaction,
    CustomerChargeSummary,
    ExceptionRecord,
    ReconciliationCorrection,
    ReconciliationResult,
    VendorChargeSummary,
    VendorMaster,
    VendorStoreMappingMaster,
)


router = APIRouter(prefix="/api/reports", tags=["reports"])


def _csv_response(filename: str, rows: list[list[str]]):
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerows(rows)
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/vendor-charges")
def vendor_charges(user: AuthUser = Depends(require_roles("MAKER", "CHECKER", "ADMIN", "AUDITOR"))):
    db = SessionLocal()
    rows = [
        [
            "VENDOR_ID",
            "MONTH_KEY",
            "BEAT_PICKUPS",
            "CALL_PICKUPS",
            "BASE_CHARGE",
            "ENHANCEMENT_CHARGE",
            "TAX_AMOUNT",
            "TOTAL_WITH_TAX",
        ]
    ]
    for item in db.query(VendorChargeSummary).all():
        rows.append(
            [
                str(item.vendor_id),
                item.month_key,
                str(item.beat_pickups),
                str(item.call_pickups),
                str(item.base_charge_amount),
                str(item.enhancement_charge),
                str(item.tax_amount),
                str(item.total_with_tax),
            ]
        )
    log_audit(db, "REPORT", "VENDOR_CHARGES", "DOWNLOAD", None, None, user.employee_id)
    db.commit()
    db.close()
    return _csv_response("vendor-charges.csv", rows)


@router.get("/customer-charges")
def customer_charges(user: AuthUser = Depends(require_roles("MAKER", "CHECKER", "ADMIN", "AUDITOR"))):
    db = SessionLocal()
    rows = [
        [
            "CUSTOMER_ID",
            "MONTH_KEY",
            "TOTAL_REMITTANCE",
            "BASE_CHARGE",
            "ENHANCEMENT_CHARGE",
            "WAIVER_AMOUNT",
            "NET_CHARGE",
            "TAX_AMOUNT",
            "TOTAL_WITH_TAX",
        ]
    ]
    for item in db.query(CustomerChargeSummary).all():
        rows.append(
            [
                item.customer_id,
                item.month_key,
                str(item.total_remittance),
                str(item.base_charge_amount),
                str(item.enhancement_charge or 0),
                str(item.waiver_amount),
                str(item.net_charge_amount),
                str(item.tax_amount),
                str(item.total_with_tax),
            ]
        )
    log_audit(db, "REPORT", "CUSTOMER_CHARGES", "DOWNLOAD", None, None, user.employee_id)
    db.commit()
    db.close()
    return _csv_response("customer-charges.csv", rows)


@router.get("/store-summary")
def store_summary(user: AuthUser = Depends(require_roles("MAKER", "CHECKER", "ADMIN", "AUDITOR"))):
    db = SessionLocal()
    rows = [["BANK_STORE_CODE", "STATUS", "REASON", "REMITTANCE_DATE", "PICKUP_DATE"]]
    for item in db.query(ReconciliationResult).all():
        rows.append(
            [
                item.bank_store_code,
                item.status,
                item.reason or "",
                str(item.remittance_date) if item.remittance_date else "",
                str(item.pickup_date) if item.pickup_date else "",
            ]
        )
    log_audit(db, "REPORT", "STORE_SUMMARY", "DOWNLOAD", None, None, user.employee_id)
    db.commit()
    db.close()
    return _csv_response("store-summary.csv", rows)


@router.get("/reconciliation-status")
def reconciliation_status(user: AuthUser = Depends(require_roles("MAKER", "CHECKER", "ADMIN", "AUDITOR"))):
    db = SessionLocal()
    rows = [["RECON_ID", "STATUS", "REASON", "REMITTANCE_DATE", "PICKUP_DATE"]]
    for item in db.query(ReconciliationResult).all():
        rows.append(
            [
                str(item.recon_id),
                item.status,
                item.reason or "",
                str(item.remittance_date) if item.remittance_date else "",
                str(item.pickup_date) if item.pickup_date else "",
            ]
        )
    log_audit(db, "REPORT", "RECON_STATUS", "DOWNLOAD", None, None, user.employee_id)
    db.commit()
    db.close()
    return _csv_response("reconciliation-status.csv", rows)


@router.get("/exception-aging")
def exception_aging(user: AuthUser = Depends(require_roles("MAKER", "CHECKER", "ADMIN", "AUDITOR"))):
    db = SessionLocal()
    rows = [["EXCEPTION_ID", "STATUS", "AGE_DAYS"]]
    now = datetime.utcnow()
    for item in db.query(ExceptionRecord).all():
        age_days = (now - item.created_date).days if item.created_date else 0
        rows.append([str(item.exception_id), item.status, str(age_days)])
    log_audit(db, "REPORT", "EXCEPTION_AGING", "DOWNLOAD", None, None, user.employee_id)
    db.commit()
    db.close()
    return _csv_response("exception-aging.csv", rows)


@router.get("/audit-logs")
def audit_logs(user: AuthUser = Depends(require_roles("ADMIN", "AUDITOR"))):
    db = SessionLocal()
    rows = [["ENTITY_TYPE", "ENTITY_ID", "ACTION", "CHANGED_BY", "CHANGED_DATE", "CHANGED_TIME"]]
    for item in db.query(AuditLog).order_by(AuditLog.changed_at.desc()).all():
        changed_at = item.changed_at
        changed_date = changed_at.date().isoformat() if changed_at else ""
        changed_time = changed_at.time().isoformat(timespec="seconds") if changed_at else ""
        rows.append(
            [
                item.entity_type,
                item.entity_id or "",
                item.action,
                item.changed_by,
                changed_date,
                changed_time,
            ]
        )
    log_audit(db, "REPORT", "AUDIT_LOGS", "DOWNLOAD", None, None, user.employee_id)
    db.commit()
    db.close()
    return _csv_response("audit-logs.csv", rows)


@router.get("/vendor-pickups")
def _vendor_pickups_rows(db, vendor_id: int, from_dt, to_dt):
    vendor = db.query(VendorMaster).filter(VendorMaster.vendor_id == vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    rows = [
        {
            "Vendor Name": vendor.vendor_name,
            "Bank Store Code": "",
            "Store Name": "",
            "Vendor Store Code": "",
            "Pickup Date": "",
            "Pickup Amount": "",
            "Pickup Type": "",
            "Account No": "",
            "Customer ID": "",
        }
    ]

    txns = (
        db.query(CanonicalTransaction)
        .filter(CanonicalTransaction.source == "VENDOR")
        .filter(CanonicalTransaction.pickup_date >= from_dt)
        .filter(CanonicalTransaction.pickup_date <= to_dt)
        .all()
    )

    rows = []
    for txn in txns:
        mapping = (
            db.query(VendorStoreMappingMaster)
            .filter(VendorStoreMappingMaster.vendor_id == vendor_id)
            .filter(VendorStoreMappingMaster.vendor_store_code == txn.vendor_store_code)
            .filter(VendorStoreMappingMaster.bank_store_code == txn.bank_store_code)
            .filter(VendorStoreMappingMaster.status == "ACTIVE")
            .filter(VendorStoreMappingMaster.effective_from <= txn.pickup_date)
            .filter(
                (VendorStoreMappingMaster.effective_to.is_(None))
                | (VendorStoreMappingMaster.effective_to >= txn.pickup_date)
            )
            .first()
        )
        if not mapping:
            continue

        store_row = (
            db.query(BankStoreMaster.store_name)
            .filter(BankStoreMaster.bank_store_code == txn.bank_store_code)
            .filter(BankStoreMaster.status == "ACTIVE")
            .filter(BankStoreMaster.effective_from <= txn.pickup_date)
            .filter(
                (BankStoreMaster.effective_to.is_(None))
                | (BankStoreMaster.effective_to >= txn.pickup_date)
            )
            .first()
        )
        store_name = store_row[0] if store_row else ""

        rows.append(
            {
                "Vendor Name": vendor.vendor_name,
                "Bank Store Code": txn.bank_store_code,
                "Store Name": store_name,
                "Vendor Store Code": txn.vendor_store_code or "",
                "Pickup Date": str(txn.pickup_date) if txn.pickup_date else "",
                "Pickup Amount": str(txn.pickup_amount) if txn.pickup_amount is not None else "",
                "Pickup Type": txn.pickup_type or "",
                "Account No": txn.account_no or "",
                "Customer ID": txn.customer_id or "",
            }
        )
    return vendor, rows


def vendor_pickups(
    vendor_id: int,
    from_date: str,
    to_date: str,
    user: AuthUser = Depends(require_roles("MAKER", "CHECKER", "ADMIN", "AUDITOR")),
):
    db = SessionLocal()
    try:
        from_dt = datetime.strptime(from_date, "%Y-%m-%d").date()
        to_dt = datetime.strptime(to_date, "%Y-%m-%d").date()
    except ValueError:
        db.close()
        raise HTTPException(status_code=400, detail="Dates must be YYYY-MM-DD")

    vendor, rows = _vendor_pickups_rows(db, vendor_id, from_dt, to_dt)

    df = pd.DataFrame(rows)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Vendor Pickups")
    output.seek(0)

    log_audit(
        db,
        "REPORT",
        "VENDOR_PICKUPS",
        "DOWNLOAD",
        None,
        f"vendor_id={vendor_id},from={from_date},to={to_date}",
        user.employee_id,
    )
    db.commit()
    db.close()
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="vendor-pickups.xlsx"'},
    )


@router.get("/vendor-pickups/preview")
def vendor_pickups_preview(
    vendor_id: int,
    from_date: str,
    to_date: str,
    user: AuthUser = Depends(require_roles("MAKER", "CHECKER", "ADMIN", "AUDITOR")),
):
    db = SessionLocal()
    try:
        from_dt = datetime.strptime(from_date, "%Y-%m-%d").date()
        to_dt = datetime.strptime(to_date, "%Y-%m-%d").date()
    except ValueError:
        db.close()
        raise HTTPException(status_code=400, detail="Dates must be YYYY-MM-DD")

    _, rows = _vendor_pickups_rows(db, vendor_id, from_dt, to_dt)
    db.close()
    return rows[:50]


@router.get("/customers")
def list_customers(user: AuthUser = Depends(require_roles("MAKER", "CHECKER", "ADMIN", "AUDITOR"))):
    db = SessionLocal()
    rows = (
        db.query(VendorStoreMappingMaster.customer_id, VendorStoreMappingMaster.customer_name)
        .filter(VendorStoreMappingMaster.customer_id.is_not(None))
        .distinct()
        .all()
    )
    payload = [
        {"customer_id": row[0], "customer_name": row[1] or ""} for row in rows if row and row[0]
    ]
    db.close()
    return payload


def _customer_pickups_rows(db, customer_id: str, from_dt, to_dt):
    rows = []
    txns = (
        db.query(CanonicalTransaction)
        .filter(CanonicalTransaction.source == "VENDOR")
        .filter(CanonicalTransaction.pickup_date >= from_dt)
        .filter(CanonicalTransaction.pickup_date <= to_dt)
        .all()
    )

    for txn in txns:
        mapping = (
            db.query(VendorStoreMappingMaster, VendorMaster)
            .join(VendorMaster, VendorStoreMappingMaster.vendor_id == VendorMaster.vendor_id)
            .filter(VendorStoreMappingMaster.customer_id == customer_id)
            .filter(VendorStoreMappingMaster.vendor_store_code == txn.vendor_store_code)
            .filter(VendorStoreMappingMaster.bank_store_code == txn.bank_store_code)
            .filter(VendorStoreMappingMaster.status == "ACTIVE")
            .filter(VendorStoreMappingMaster.effective_from <= txn.pickup_date)
            .filter(
                (VendorStoreMappingMaster.effective_to.is_(None))
                | (VendorStoreMappingMaster.effective_to >= txn.pickup_date)
            )
            .first()
        )
        if not mapping:
            continue
        mapping_row, vendor = mapping

        store_row = (
            db.query(BankStoreMaster.store_name)
            .filter(BankStoreMaster.bank_store_code == txn.bank_store_code)
            .filter(BankStoreMaster.status == "ACTIVE")
            .filter(BankStoreMaster.effective_from <= txn.pickup_date)
            .filter(
                (BankStoreMaster.effective_to.is_(None))
                | (BankStoreMaster.effective_to >= txn.pickup_date)
            )
            .first()
        )
        store_name = store_row[0] if store_row else ""

        rows.append(
            {
                "Customer ID": mapping_row.customer_id or "",
                "Customer Name": mapping_row.customer_name or "",
                "Vendor Name": vendor.vendor_name,
                "Bank Store Code": txn.bank_store_code,
                "Store Name": store_name,
                "Vendor Store Code": txn.vendor_store_code or "",
                "Pickup Date": str(txn.pickup_date) if txn.pickup_date else "",
                "Pickup Amount": str(txn.pickup_amount) if txn.pickup_amount is not None else "",
                "Pickup Type": txn.pickup_type or "",
                "Account No": txn.account_no or "",
            }
        )
    return rows


@router.get("/customer-pickups")
def customer_pickups(
    customer_id: str,
    from_date: str,
    to_date: str,
    user: AuthUser = Depends(require_roles("MAKER", "CHECKER", "ADMIN", "AUDITOR")),
):
    db = SessionLocal()
    try:
        from_dt = datetime.strptime(from_date, "%Y-%m-%d").date()
        to_dt = datetime.strptime(to_date, "%Y-%m-%d").date()
    except ValueError:
        db.close()
        raise HTTPException(status_code=400, detail="Dates must be YYYY-MM-DD")

    rows = _customer_pickups_rows(db, customer_id, from_dt, to_dt)
    df = pd.DataFrame(rows)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Customer Pickups")
    output.seek(0)

    log_audit(
        db,
        "REPORT",
        "CUSTOMER_PICKUPS",
        "DOWNLOAD",
        None,
        f"customer_id={customer_id},from={from_date},to={to_date}",
        user.employee_id,
    )
    db.commit()
    db.close()
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="customer-pickups.xlsx"'},
    )


@router.get("/customer-pickups/preview")
def customer_pickups_preview(
    customer_id: str,
    from_date: str,
    to_date: str,
    user: AuthUser = Depends(require_roles("MAKER", "CHECKER", "ADMIN", "AUDITOR")),
):
    db = SessionLocal()
    try:
        from_dt = datetime.strptime(from_date, "%Y-%m-%d").date()
        to_dt = datetime.strptime(to_date, "%Y-%m-%d").date()
    except ValueError:
        db.close()
        raise HTTPException(status_code=400, detail="Dates must be YYYY-MM-DD")

    rows = _customer_pickups_rows(db, customer_id, from_dt, to_dt)
    db.close()
    return rows[:50]


def _recon_final_rows(db, from_dt, to_dt):
    results = (
        db.query(ReconciliationResult)
        .filter(
            (
                (ReconciliationResult.pickup_date >= from_dt)
                & (ReconciliationResult.pickup_date <= to_dt)
            )
            | (
                (ReconciliationResult.remittance_date >= from_dt)
                & (ReconciliationResult.remittance_date <= to_dt)
            )
        )
        .order_by(ReconciliationResult.created_date.desc())
        .all()
    )

    latest_status = {}
    correction_rows = (
        db.query(ReconciliationCorrection, ApprovalRequest)
        .join(ApprovalRequest, ApprovalRequest.approval_id == ReconciliationCorrection.approval_id)
        .order_by(ReconciliationCorrection.created_date.desc())
        .all()
    )
    for correction, approval in correction_rows:
        if correction.recon_id not in latest_status:
            latest_status[correction.recon_id] = approval.status

    rows = []
    for item in results:
        status = latest_status.get(item.recon_id)
        if status and status != "APPROVED":
            continue

        date_key = item.remittance_date or item.pickup_date
        store_row = (
            db.query(BankStoreMaster.store_name)
            .filter(BankStoreMaster.bank_store_code == item.bank_store_code)
            .filter(BankStoreMaster.status == "ACTIVE")
            .filter(BankStoreMaster.effective_from <= date_key)
            .filter(
                (BankStoreMaster.effective_to.is_(None))
                | (BankStoreMaster.effective_to >= date_key)
            )
            .first()
        )
        store_name = store_row[0] if store_row else ""

        vendor_rows = (
            db.query(VendorMaster.vendor_name)
            .join(
                VendorStoreMappingMaster,
                VendorStoreMappingMaster.vendor_id == VendorMaster.vendor_id,
            )
            .filter(VendorStoreMappingMaster.bank_store_code == item.bank_store_code)
            .filter(VendorStoreMappingMaster.status == "ACTIVE")
            .filter(VendorStoreMappingMaster.effective_from <= date_key)
            .filter(
                (VendorStoreMappingMaster.effective_to.is_(None))
                | (VendorStoreMappingMaster.effective_to >= date_key)
            )
            .all()
        )
        vendor_names = ", ".join(sorted({row[0] for row in vendor_rows if row and row[0]}))

        rows.append(
            {
                "Bank Store Code": item.bank_store_code,
                "Store Name": store_name,
                "Vendor Names": vendor_names,
                "Pickup Date": str(item.pickup_date) if item.pickup_date else "",
                "Pickup Amount": str(item.pickup_amount) if item.pickup_amount is not None else "",
                "Remittance Date": str(item.remittance_date) if item.remittance_date else "",
                "Remittance Amount": str(item.remittance_amount) if item.remittance_amount is not None else "",
                "Status": item.status,
                "Reason": item.reason or "",
            }
        )
    return rows


@router.get("/reconciliation-final")
def reconciliation_final(
    from_date: str,
    to_date: str,
    user: AuthUser = Depends(require_roles("MAKER", "CHECKER", "ADMIN", "AUDITOR")),
):
    db = SessionLocal()
    try:
        from_dt = datetime.strptime(from_date, "%Y-%m-%d").date()
        to_dt = datetime.strptime(to_date, "%Y-%m-%d").date()
    except ValueError:
        db.close()
        raise HTTPException(status_code=400, detail="Dates must be YYYY-MM-DD")

    rows = _recon_final_rows(db, from_dt, to_dt)
    df = pd.DataFrame(rows)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Reconciliation Final")
    output.seek(0)

    log_audit(
        db,
        "REPORT",
        "RECON_FINAL",
        "DOWNLOAD",
        None,
        f"from={from_date},to={to_date}",
        user.employee_id,
    )
    db.commit()
    db.close()
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="reconciliation-final.xlsx"'},
    )


@router.get("/reconciliation-final/preview")
def reconciliation_final_preview(
    from_date: str,
    to_date: str,
    user: AuthUser = Depends(require_roles("MAKER", "CHECKER", "ADMIN", "AUDITOR")),
):
    db = SessionLocal()
    try:
        from_dt = datetime.strptime(from_date, "%Y-%m-%d").date()
        to_dt = datetime.strptime(to_date, "%Y-%m-%d").date()
    except ValueError:
        db.close()
        raise HTTPException(status_code=400, detail="Dates must be YYYY-MM-DD")

    rows = _recon_final_rows(db, from_dt, to_dt)
    db.close()
    return rows[:50]
