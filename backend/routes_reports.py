import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, Response

from auth import AuthUser, require_roles
from audit import log_audit
from db import SessionLocal
from models import (
    AuditLog,
    CustomerChargeSummary,
    ExceptionRecord,
    ReconciliationResult,
    VendorChargeSummary,
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
