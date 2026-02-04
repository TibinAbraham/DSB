from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from auth import AuthUser, require_roles
from audit import log_audit
from db import SessionLocal
from models import (
    BankStoreMaster,
    CanonicalTransaction,
    ExceptionRecord,
    FinacleUploadBatch,
    MonthLock,
    ReconciliationCorrection,
    ReconciliationResult,
    ApprovalRequest,
    VendorMaster,
    VendorStoreMappingMaster,
    VendorUploadBatch,
)


router = APIRouter(prefix="/api/reconciliation", tags=["reconciliation"])


@router.post("/run")
def run_reconciliation(payload: dict, user: AuthUser = Depends(require_roles("MAKER", "ADMIN", "CHECKER"))):
    db = SessionLocal()
    mis_date_raw = payload.get("misDate")
    if not mis_date_raw:
        db.close()
        raise HTTPException(status_code=400, detail="misDate is required")
    try:
        mis_date = datetime.strptime(mis_date_raw, "%Y-%m-%d").date()
    except ValueError:
        db.close()
        raise HTTPException(status_code=400, detail="misDate must be YYYY-MM-DD")

    month_key = mis_date.strftime("%Y%m")
    locked_months = {
        lock.month_key for lock in db.query(MonthLock).filter(MonthLock.status == "LOCKED").all()
    }
    if month_key in locked_months:
        db.close()
        raise HTTPException(status_code=409, detail="Month is locked for reconciliation")

    finacle_batch = (
        db.query(FinacleUploadBatch)
        .filter(FinacleUploadBatch.mis_date == mis_date)
        .first()
    )
    if not finacle_batch:
        db.close()
        raise HTTPException(status_code=404, detail="Finacle MIS not uploaded for date")

    vendor_batches = (
        db.query(VendorUploadBatch)
        .filter(VendorUploadBatch.mis_date == mis_date)
        .all()
    )

    finacle = (
        db.query(CanonicalTransaction)
        .filter(CanonicalTransaction.source == "FINACLE")
        .filter(CanonicalTransaction.raw_batch_id == finacle_batch.batch_id)
        .all()
    )
    if vendor_batches:
        vendor = (
            db.query(CanonicalTransaction)
            .filter(CanonicalTransaction.source == "VENDOR")
            .filter(CanonicalTransaction.raw_batch_id.in_([b.batch_id for b in vendor_batches]))
            .all()
        )
    else:
        vendor = []

    finacle_agg = {}
    for f in finacle:
        date_key = f.remittance_date or f.pickup_date
        if not f.bank_store_code or not date_key:
            continue
        key = (f.bank_store_code, date_key)
        finacle_agg[key] = (finacle_agg.get(key, 0.0) + float(f.remittance_amount or 0))

    vendor_agg = {}
    for v in vendor:
        if not v.vendor_store_code or not v.pickup_date:
            continue
        mapping_query = (
            db.query(VendorStoreMappingMaster.bank_store_code, VendorMaster.vendor_name)
            .join(VendorMaster, VendorStoreMappingMaster.vendor_id == VendorMaster.vendor_id)
            .filter(VendorStoreMappingMaster.vendor_store_code == v.vendor_store_code)
            .filter(VendorStoreMappingMaster.status == "ACTIVE")
            .filter(VendorStoreMappingMaster.effective_from <= v.pickup_date)
            .filter(
                (VendorStoreMappingMaster.effective_to.is_(None))
                | (VendorStoreMappingMaster.effective_to >= v.pickup_date)
            )
        )
        mapped_bank = mapping_query.first()
        if not mapped_bank:
            continue
        bank_store_code, vendor_name = mapped_bank
        key = (bank_store_code, v.pickup_date)
        entry = vendor_agg.setdefault(key, {"amount": 0.0, "vendor_names": set()})
        entry["amount"] += float(v.pickup_amount or 0)
        if vendor_name:
            entry["vendor_names"].add(vendor_name)

    results = []
    extra_by_id = {}
    all_keys = set(finacle_agg.keys()) | set(vendor_agg.keys())
    for bank_store_code, date_key in sorted(all_keys):
        finacle_amount = finacle_agg.get((bank_store_code, date_key))
        vendor_entry = vendor_agg.get((bank_store_code, date_key))
        vendor_amount = vendor_entry["amount"] if vendor_entry else None
        vendor_names = sorted(vendor_entry["vendor_names"]) if vendor_entry else []
        store_row = (
            db.query(BankStoreMaster.store_name)
            .filter(BankStoreMaster.bank_store_code == bank_store_code)
            .filter(BankStoreMaster.status == "ACTIVE")
            .filter(BankStoreMaster.effective_from <= date_key)
            .filter(
                (BankStoreMaster.effective_to.is_(None)) | (BankStoreMaster.effective_to >= date_key)
            )
            .first()
        )
        store_name = store_row[0] if store_row else None
        if finacle_amount is None:
            status = "MISSING_FINACLE"
            reason = "Finacle record not found for store/date"
        elif vendor_amount is None:
            status = "MISSING_VENDOR"
            reason = "Vendor record not found for store/date"
        elif float(finacle_amount) == float(vendor_amount):
            status = "MATCHED"
            reason = None
        else:
            status = "AMOUNT_MISMATCH"
            reason = "Amount mismatch"

        existing = (
            db.query(ReconciliationResult)
            .filter(ReconciliationResult.bank_store_code == bank_store_code)
            .filter(
                (ReconciliationResult.pickup_date == date_key)
                | (ReconciliationResult.remittance_date == date_key)
            )
            .order_by(ReconciliationResult.created_date.desc())
            .first()
        )

        if existing:
            recon = existing
            recon.pickup_date = date_key
            recon.remittance_date = date_key
            recon.pickup_amount = vendor_amount
            recon.remittance_amount = finacle_amount
            recon.status = status
            recon.reason = reason
        else:
            recon = ReconciliationResult(
                finacle_canonical_id=None,
                vendor_canonical_id=None,
                bank_store_code=bank_store_code,
                pickup_date=date_key,
                remittance_date=date_key,
                pickup_amount=vendor_amount,
                remittance_amount=finacle_amount,
                status=status,
                reason=reason,
            )
            db.add(recon)
            db.flush()
        extra_by_id[recon.recon_id] = {
            "vendor_names": ", ".join(vendor_names) if vendor_names else None,
            "store_name": store_name,
        }
        if status != "MATCHED":
            existing_exception = (
                db.query(ExceptionRecord)
                .filter(ExceptionRecord.recon_id == recon.recon_id)
                .filter(ExceptionRecord.status == "OPEN")
                .first()
            )
            if not existing_exception:
                db.add(
                    ExceptionRecord(
                        recon_id=recon.recon_id,
                        exception_type=status,
                        status="OPEN",
                        details=reason,
                        created_by=user.employee_id,
                    )
                )
            else:
                existing_exception.exception_type = status
                existing_exception.details = reason
        else:
            (
                db.query(ExceptionRecord)
                .filter(ExceptionRecord.recon_id == recon.recon_id)
                .filter(ExceptionRecord.status == "OPEN")
                .update(
                    {
                        "status": "RESOLVED",
                        "resolved_by": user.employee_id,
                        "resolved_date": datetime.utcnow(),
                        "remarks": "Auto-resolved after reconciliation rerun",
                    }
                )
            )
        results.append(recon)

    log_audit(
        db,
        entity_type="RECONCILIATION",
        entity_id="RUN",
        action="EXECUTE",
        old_data=None,
        new_data=f"results={len(results)}",
        changed_by=user.employee_id,
    )
    db.commit()
    payload = []
    for r in results:
        extras = extra_by_id.get(r.recon_id, {})
        payload.append(
            {
                "recon_id": r.recon_id,
                "bank_store_code": r.bank_store_code,
                "store_name": extras.get("store_name"),
                "vendor_names": extras.get("vendor_names"),
                "pickup_date": r.pickup_date,
                "remittance_date": r.remittance_date,
                "pickup_amount": float(r.pickup_amount) if r.pickup_amount is not None else None,
                "remittance_amount": float(r.remittance_amount)
                if r.remittance_amount is not None
                else None,
                "status": r.status,
                "reason": r.reason,
            }
        )
    db.close()
    return payload


@router.get("/results")
def list_results(misDate: str, user: AuthUser = Depends(require_roles("MAKER", "ADMIN", "CHECKER", "AUDITOR"))):
    db = SessionLocal()
    try:
        mis_date = datetime.strptime(misDate, "%Y-%m-%d").date()
    except ValueError:
        db.close()
        raise HTTPException(status_code=400, detail="misDate must be YYYY-MM-DD")

    results = (
        db.query(ReconciliationResult)
        .filter(
            (ReconciliationResult.pickup_date == mis_date)
            | (ReconciliationResult.remittance_date == mis_date)
        )
        .order_by(ReconciliationResult.created_date.desc())
        .all()
    )

    unique_results = {}
    for r in results:
        date_key = r.remittance_date or r.pickup_date
        key = (r.bank_store_code, date_key)
        if key not in unique_results:
            unique_results[key] = r

    payload = []
    for r in unique_results.values():
        date_key = r.remittance_date or r.pickup_date
        store_row = (
            db.query(BankStoreMaster.store_name)
            .filter(BankStoreMaster.bank_store_code == r.bank_store_code)
            .filter(BankStoreMaster.status == "ACTIVE")
            .filter(BankStoreMaster.effective_from <= date_key)
            .filter(
                (BankStoreMaster.effective_to.is_(None))
                | (BankStoreMaster.effective_to >= date_key)
            )
            .first()
        )
        store_name = store_row[0] if store_row else None

        vendor_rows = (
            db.query(VendorMaster.vendor_name)
            .join(
                VendorStoreMappingMaster,
                VendorStoreMappingMaster.vendor_id == VendorMaster.vendor_id,
            )
            .filter(VendorStoreMappingMaster.bank_store_code == r.bank_store_code)
            .filter(VendorStoreMappingMaster.status == "ACTIVE")
            .filter(VendorStoreMappingMaster.effective_from <= date_key)
            .filter(
                (VendorStoreMappingMaster.effective_to.is_(None))
                | (VendorStoreMappingMaster.effective_to >= date_key)
            )
            .all()
        )
        vendor_names = ", ".join(sorted({row[0] for row in vendor_rows if row and row[0]}))

        correction_row = (
            db.query(ReconciliationCorrection, ApprovalRequest)
            .join(ApprovalRequest, ApprovalRequest.approval_id == ReconciliationCorrection.approval_id)
            .filter(ReconciliationCorrection.recon_id == r.recon_id)
            .order_by(ReconciliationCorrection.created_date.desc())
            .first()
        )
        correction_status = None
        correction_reason = None
        if correction_row:
            correction_status = correction_row[1].status
            correction_reason = correction_row[1].reason

        payload.append(
            {
                "recon_id": r.recon_id,
                "bank_store_code": r.bank_store_code,
                "store_name": store_name,
                "vendor_names": vendor_names or None,
                "pickup_date": r.pickup_date,
                "remittance_date": r.remittance_date,
                "pickup_amount": float(r.pickup_amount) if r.pickup_amount is not None else None,
                "remittance_amount": float(r.remittance_amount)
                if r.remittance_amount is not None
                else None,
                "status": r.status,
                "reason": r.reason,
                "correction_status": correction_status,
                "correction_reason": correction_reason,
            }
        )

    db.close()
    return payload
