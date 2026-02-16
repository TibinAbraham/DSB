import calendar
import math
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status

from auth import AuthUser, require_roles
from audit import log_audit
from db import SessionLocal
from models import (
    CanonicalTransaction,
    ChargeConfigurationMaster,
    CustomerChargeSlab,
    CustomerChargeSummary,
    MonthLock,
    PickupRulesMaster,
    VendorChargeMaster,
    VendorChargeSummary,
    VendorMaster,
    VendorStoreMappingMaster,
    VendorUploadBatch,
    WaiverMaster,
)


router = APIRouter(prefix="/api/charges", tags=["charges"])

ENHANCEMENT_THRESHOLD_CODE = "ENHANCEMENT_THRESHOLD_AMOUNT"
ENHANCEMENT_CHARGE_CODE = "ENHANCEMENT_CHARGE_AMOUNT"
GST_ENABLED_CODE = "GST_ENABLED"
GST_RATE_CODE = "GST_RATE_PERCENT"
CUSTOMER_CHARGE_RATE_CODE = "CUSTOMER_CHARGE_RATE_PERCENT"


def _get_config_number(db, code, as_of_date):
    row = (
        db.query(ChargeConfigurationMaster)
        .filter(ChargeConfigurationMaster.config_code == code)
        .filter(ChargeConfigurationMaster.status == "ACTIVE")
        .filter(ChargeConfigurationMaster.effective_from <= as_of_date)
        .filter(
            (ChargeConfigurationMaster.effective_to.is_(None))
            | (ChargeConfigurationMaster.effective_to >= as_of_date)
        )
        .order_by(ChargeConfigurationMaster.effective_from.desc())
        .first()
    )
    return float(row.value_number) if row and row.value_number is not None else None


def _get_config_text(db, code, as_of_date):
    row = (
        db.query(ChargeConfigurationMaster)
        .filter(ChargeConfigurationMaster.config_code == code)
        .filter(ChargeConfigurationMaster.status == "ACTIVE")
        .filter(ChargeConfigurationMaster.effective_from <= as_of_date)
        .filter(
            (ChargeConfigurationMaster.effective_to.is_(None))
            | (ChargeConfigurationMaster.effective_to >= as_of_date)
        )
        .order_by(ChargeConfigurationMaster.effective_from.desc())
        .first()
    )
    return row.value_text if row else None


def _enforce_unlocked(db, month_key):
    lock = db.query(MonthLock).filter(MonthLock.month_key == month_key).first()
    if lock and lock.status == "LOCKED":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Month is locked")


@router.get("/vendor/summary")
def list_vendor_charges(
    month_key: str | None = None,
    user: AuthUser = Depends(require_roles("MAKER", "CHECKER", "ADMIN", "AUDITOR")),
):
    """List vendor charge summaries for maker/admin view."""
    db = SessionLocal()
    q = db.query(VendorChargeSummary, VendorMaster.vendor_name, VendorMaster.vendor_code).outerjoin(
        VendorMaster, VendorChargeSummary.vendor_id == VendorMaster.vendor_id
    )
    if month_key:
        q = q.filter(VendorChargeSummary.month_key == month_key)
    rows = q.order_by(VendorChargeSummary.month_key.desc(), VendorChargeSummary.vendor_id).all()
    result = [
        {
            "summary_id": s.summary_id,
            "vendor_id": s.vendor_id,
            "vendor_name": name or "",
            "vendor_code": code or "",
            "month_key": s.month_key,
            "beat_pickups": s.beat_pickups,
            "call_pickups": s.call_pickups,
            "base_charge_amount": float(s.base_charge_amount or 0),
            "enhancement_charge": float(s.enhancement_charge or 0),
            "tax_amount": float(s.tax_amount or 0),
            "total_with_tax": float(s.total_with_tax or 0),
            "status": s.status,
            "computed_by": s.computed_by,
            "computed_at": s.computed_at.isoformat() if s.computed_at else None,
        }
        for s, name, code in rows
    ]
    db.close()
    return result


@router.get("/customer/summary")
def list_customer_charges(
    month_key: str | None = None,
    user: AuthUser = Depends(require_roles("MAKER", "CHECKER", "ADMIN", "AUDITOR")),
):
    """List customer charge summaries for maker/admin view."""
    db = SessionLocal()
    q = db.query(CustomerChargeSummary)
    if month_key:
        q = q.filter(CustomerChargeSummary.month_key == month_key)
    rows = q.order_by(CustomerChargeSummary.month_key.desc(), CustomerChargeSummary.customer_id).all()
    result = [
        {
            "summary_id": s.summary_id,
            "customer_id": s.customer_id,
            "month_key": s.month_key,
            "total_remittance": float(s.total_remittance or 0),
            "base_charge_amount": float(s.base_charge_amount or 0),
            "enhancement_charge": float(s.enhancement_charge or 0),
            "waiver_amount": float(s.waiver_amount or 0),
            "net_charge_amount": float(s.net_charge_amount or 0),
            "tax_amount": float(s.tax_amount or 0),
            "total_with_tax": float(s.total_with_tax or 0),
            "status": s.status,
            "computed_by": s.computed_by,
            "computed_at": s.computed_at.isoformat() if s.computed_at else None,
        }
        for s in rows
    ]
    db.close()
    return result


@router.get("/months")
def list_charge_months(user: AuthUser = Depends(require_roles("MAKER", "CHECKER", "ADMIN", "AUDITOR"))):
    """List distinct month_keys that have vendor or customer charges."""
    db = SessionLocal()
    v_months = db.query(VendorChargeSummary.month_key).distinct().all()
    c_months = db.query(CustomerChargeSummary.month_key).distinct().all()
    all_months = sorted(set(m[0] for m in v_months + c_months), reverse=True)
    db.close()
    return {"months": all_months}


@router.post("/vendor/compute")
def compute_vendor_charges(payload: dict, user: AuthUser = Depends(require_roles("MAKER", "ADMIN"))):
    month_key = payload.get("month_key")
    if not month_key:
        raise HTTPException(status_code=400, detail="month_key is required (YYYYMM)")

    db = SessionLocal()
    _enforce_unlocked(db, month_key)

    year = int(month_key[:4])
    month = int(month_key[4:6])
    last_day = calendar.monthrange(year, month)[1]
    as_of_date = datetime(year, month, last_day).date()

    threshold = _get_config_number(db, ENHANCEMENT_THRESHOLD_CODE, as_of_date)
    enhancement_charge = _get_config_number(db, ENHANCEMENT_CHARGE_CODE, as_of_date)
    if threshold is None or enhancement_charge is None:
        db.close()
        raise HTTPException(status_code=400, detail="Enhancement charge configs missing")

    gst_enabled = _get_config_text(db, GST_ENABLED_CODE, as_of_date)
    gst_rate = _get_config_number(db, GST_RATE_CODE, as_of_date) or 0.0
    free_limit = (
        db.query(PickupRulesMaster)
        .filter(PickupRulesMaster.pickup_type == "CALL")
        .filter(PickupRulesMaster.status == "ACTIVE")
        .filter(PickupRulesMaster.effective_from <= as_of_date)
        .filter(
            (PickupRulesMaster.effective_to.is_(None))
            | (PickupRulesMaster.effective_to >= as_of_date)
        )
        .order_by(PickupRulesMaster.effective_from.desc())
        .first()
    )
    call_free_limit = int(free_limit.free_limit) if free_limit and free_limit.free_limit else 0

    vendor_ids = payload.get("vendor_ids")
    batch_query = db.query(VendorUploadBatch).filter(VendorUploadBatch.mis_date.isnot(None))
    if vendor_ids:
        batch_query = batch_query.filter(VendorUploadBatch.vendor_id.in_(vendor_ids))
    batches = [b for b in batch_query.all() if b.mis_date.strftime("%Y%m") == month_key]

    vendor_ids_in_month = sorted({b.vendor_id for b in batches})

    results = []
    for vendor_id in vendor_ids_in_month:
        existing = (
            db.query(VendorChargeSummary)
            .filter(VendorChargeSummary.vendor_id == vendor_id)
            .filter(VendorChargeSummary.month_key == month_key)
            .first()
        )
        if existing:
            db.close()
            raise HTTPException(status_code=409, detail="Vendor charges already computed for month")

        batch_ids = [b.batch_id for b in batches if b.vendor_id == vendor_id]
        vendor_txns = (
            db.query(CanonicalTransaction)
            .filter(CanonicalTransaction.source == "VENDOR")
            .filter(CanonicalTransaction.raw_batch_id.in_(batch_ids))
            .all()
        )
        beat_pickups = sum(1 for t in vendor_txns if t.pickup_type == "BEAT")
        call_pickups = sum(1 for t in vendor_txns if t.pickup_type == "CALL")
        chargeable_calls = max(0, call_pickups - call_free_limit)

        beat_rate = (
            db.query(VendorChargeMaster)
            .filter(VendorChargeMaster.vendor_id == vendor_id)
            .filter(VendorChargeMaster.pickup_type == "BEAT")
            .filter(VendorChargeMaster.status == "ACTIVE")
            .filter(VendorChargeMaster.effective_from <= as_of_date)
            .filter(
                (VendorChargeMaster.effective_to.is_(None))
                | (VendorChargeMaster.effective_to >= as_of_date)
            )
            .order_by(VendorChargeMaster.effective_from.desc())
            .first()
        )
        call_rate = (
            db.query(VendorChargeMaster)
            .filter(VendorChargeMaster.vendor_id == vendor_id)
            .filter(VendorChargeMaster.pickup_type == "CALL")
            .filter(VendorChargeMaster.status == "ACTIVE")
            .filter(VendorChargeMaster.effective_from <= as_of_date)
            .filter(
                (VendorChargeMaster.effective_to.is_(None))
                | (VendorChargeMaster.effective_to >= as_of_date)
            )
            .order_by(VendorChargeMaster.effective_from.desc())
            .first()
        )
        if beat_pickups and not beat_rate:
            db.close()
            raise HTTPException(status_code=400, detail="Beat charge config missing for vendor")
        if chargeable_calls and not call_rate:
            db.close()
            raise HTTPException(status_code=400, detail="Call charge config missing for vendor")

        beat_charge = float(beat_rate.base_charge) * beat_pickups if beat_rate else 0.0
        call_charge = float(call_rate.base_charge) * chargeable_calls if call_rate else 0.0
        base_charge_amount = beat_charge + call_charge

        total_remittance = sum(float(t.pickup_amount or 0) for t in vendor_txns)
        enhancement_units = math.floor(total_remittance / threshold)
        enhancement_amount = enhancement_units * enhancement_charge

        total_charge_amount = base_charge_amount + enhancement_amount
        tax_amount = total_charge_amount * (gst_rate / 100) if str(gst_enabled).upper() == "Y" else 0.0
        total_with_tax = total_charge_amount + tax_amount

        summary = VendorChargeSummary(
            vendor_id=vendor_id,
            month_key=month_key,
            beat_pickups=beat_pickups,
            call_pickups=call_pickups,
            base_charge_amount=base_charge_amount,
            enhancement_charge=enhancement_amount,
            tax_amount=tax_amount,
            total_charge_amount=total_charge_amount,
            total_with_tax=total_with_tax,
            status="COMPUTED",
            computed_by=user.employee_id,
        )
        db.add(summary)
        results.append(summary)

    log_audit(
        db,
        entity_type="CHARGES",
        entity_id="VENDOR",
        action="COMPUTE",
        old_data=None,
        new_data=f"month_key={month_key},count={len(results)}",
        changed_by=user.employee_id,
    )
    db.commit()
    db.close()
    return {"status": "ok", "computed": len(results)}


def _get_slab_charge(db, vendor_id: int, total_remittance: float, as_of_date) -> float:
    """Get slab-based charge for vendor. Returns charge_amount or None if no slab."""
    slabs = (
        db.query(CustomerChargeSlab)
        .filter(CustomerChargeSlab.vendor_id == vendor_id)
        .filter(CustomerChargeSlab.status == "ACTIVE")
        .filter(CustomerChargeSlab.effective_from <= as_of_date)
        .filter(
            (CustomerChargeSlab.effective_to.is_(None))
            | (CustomerChargeSlab.effective_to >= as_of_date)
        )
        .order_by(CustomerChargeSlab.amount_from.asc())
        .all()
    )
    for slab in slabs:
        if slab.amount_from <= total_remittance <= slab.amount_to:
            return float(slab.charge_amount)
    return None


@router.post("/customer/compute")
def compute_customer_charges(payload: dict, user: AuthUser = Depends(require_roles("MAKER", "ADMIN"))):
    month_key = payload.get("month_key")
    if not month_key:
        raise HTTPException(status_code=400, detail="month_key is required (YYYYMM)")

    db = SessionLocal()
    _enforce_unlocked(db, month_key)

    year = int(month_key[:4])
    month = int(month_key[4:6])
    last_day = calendar.monthrange(year, month)[1]
    as_of_date = datetime(year, month, last_day).date()

    gst_enabled = _get_config_text(db, GST_ENABLED_CODE, as_of_date)
    gst_rate = _get_config_number(db, GST_RATE_CODE, as_of_date) or 0.0
    threshold = _get_config_number(db, ENHANCEMENT_THRESHOLD_CODE, as_of_date) or 50000.0
    enhancement_per_unit = _get_config_number(db, ENHANCEMENT_CHARGE_CODE, as_of_date) or 60.0
    customer_rate_fallback = _get_config_number(db, CUSTOMER_CHARGE_RATE_CODE, as_of_date)

    batches = [
        b
        for b in db.query(VendorUploadBatch).filter(VendorUploadBatch.mis_date.isnot(None)).all()
        if b.mis_date.strftime("%Y%m") == month_key
    ]
    batch_ids = [b.batch_id for b in batches]
    vendor_by_batch = {b.batch_id: b.vendor_id for b in batches}

    txns = (
        db.query(CanonicalTransaction)
        .filter(CanonicalTransaction.source == "VENDOR")
        .filter(CanonicalTransaction.raw_batch_id.in_(batch_ids))
        .all()
    )

    customer_vendor_data = {}
    for txn in txns:
        date_val = txn.remittance_date or txn.pickup_date
        if not date_val or date_val.strftime("%Y%m") != month_key:
            continue
        vendor_id = vendor_by_batch.get(txn.raw_batch_id)
        if not vendor_id:
            continue
        customer_id = txn.customer_id
        if not customer_id:
            mapping = (
                db.query(VendorStoreMappingMaster)
                .filter(VendorStoreMappingMaster.vendor_id == vendor_id)
                .filter(VendorStoreMappingMaster.bank_store_code == txn.bank_store_code)
                .filter(VendorStoreMappingMaster.vendor_store_code == (txn.vendor_store_code or ""))
                .filter(VendorStoreMappingMaster.status == "ACTIVE")
                .filter(VendorStoreMappingMaster.effective_from <= date_val)
                .filter(
                    (VendorStoreMappingMaster.effective_to.is_(None))
                    | (VendorStoreMappingMaster.effective_to >= date_val)
                )
                .first()
            )
            customer_id = mapping.customer_id if mapping else None
        if not customer_id:
            continue
        amt = float(txn.remittance_amount or txn.pickup_amount or 0)
        beat_amt = amt if (txn.pickup_type or "").upper() == "BEAT" else 0.0
        key = (customer_id, vendor_id)
        if key not in customer_vendor_data:
            customer_vendor_data[key] = {"remittance": 0.0, "beat_amount": 0.0}
        customer_vendor_data[key]["remittance"] += amt
        customer_vendor_data[key]["beat_amount"] += beat_amt

    customer_totals = {}
    for (customer_id, vendor_id), data in customer_vendor_data.items():
        if customer_id not in customer_totals:
            customer_totals[customer_id] = {
                "total_remittance": 0.0,
                "base_charge": 0.0,
                "enhancement": 0.0,
            }
        customer_totals[customer_id]["total_remittance"] += data["remittance"]
        slab_charge = _get_slab_charge(db, vendor_id, data["remittance"], as_of_date)
        if slab_charge is not None:
            customer_totals[customer_id]["base_charge"] += slab_charge
        elif customer_rate_fallback is not None:
            customer_totals[customer_id]["base_charge"] += data["remittance"] * (
                customer_rate_fallback / 100
            )
        beat_enhancement = math.floor(data["beat_amount"] / threshold) * enhancement_per_unit
        customer_totals[customer_id]["enhancement"] += beat_enhancement

    results = []
    for customer_id, data in customer_totals.items():
        existing = (
            db.query(CustomerChargeSummary)
            .filter(CustomerChargeSummary.customer_id == customer_id)
            .filter(CustomerChargeSummary.month_key == month_key)
            .first()
        )
        if existing:
            db.close()
            raise HTTPException(status_code=409, detail="Customer charges already computed for month")

        base_charge_amount = data["base_charge"] + data["enhancement"]
        enhancement_amount = data["enhancement"]

        waiver = (
            db.query(WaiverMaster)
            .filter(WaiverMaster.customer_id == customer_id)
            .filter(WaiverMaster.status == "ACTIVE")
            .filter(WaiverMaster.waiver_from <= as_of_date)
            .filter((WaiverMaster.waiver_to.is_(None)) | (WaiverMaster.waiver_to >= as_of_date))
            .order_by(WaiverMaster.waiver_from.desc())
            .first()
        )
        waiver_amount = 0.0
        if waiver:
            if waiver.waiver_type == "PERCENT" and waiver.waiver_percentage:
                waiver_amount = base_charge_amount * (float(waiver.waiver_percentage) / 100)
            elif waiver.waiver_type == "CAP" and waiver.waiver_cap_amount:
                waiver_amount = float(waiver.waiver_cap_amount)
            elif waiver.waiver_type == "BOTH":
                pct_amt = (
                    base_charge_amount * (float(waiver.waiver_percentage) / 100)
                    if waiver.waiver_percentage
                    else 0.0
                )
                cap_amt = float(waiver.waiver_cap_amount) if waiver.waiver_cap_amount else 0.0
                waiver_amount = min(pct_amt, cap_amt) if cap_amt else pct_amt

        net_charge_amount = max(0.0, base_charge_amount - waiver_amount)
        tax_amount = net_charge_amount * (gst_rate / 100) if str(gst_enabled).upper() == "Y" else 0.0
        total_with_tax = net_charge_amount + tax_amount

        summary = CustomerChargeSummary(
            customer_id=customer_id,
            month_key=month_key,
            total_remittance=data["total_remittance"],
            base_charge_amount=data["base_charge"],
            enhancement_charge=enhancement_amount,
            waiver_amount=waiver_amount,
            net_charge_amount=net_charge_amount,
            tax_amount=tax_amount,
            total_with_tax=total_with_tax,
            status="COMPUTED",
            computed_by=user.employee_id,
        )
        db.add(summary)
        results.append(summary)

    log_audit(
        db,
        entity_type="CHARGES",
        entity_id="CUSTOMER",
        action="COMPUTE",
        old_data=None,
        new_data=f"month_key={month_key},count={len(results)}",
        changed_by=user.employee_id,
    )
    db.commit()
    db.close()
    return {"status": "ok", "computed": len(results)}
