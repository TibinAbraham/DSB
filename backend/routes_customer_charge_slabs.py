"""Customer charge slabs - vendor-specific slab configuration for customer charges."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status

from auth import AuthUser, require_roles
from db import SessionLocal
from models import CustomerChargeSlab, VendorMaster


router = APIRouter(prefix="/api/customer-charge-slabs", tags=["customer-charge-slabs"])


@router.get("")
def list_customer_charge_slabs(
    vendor_id: int | None = None,
    user: AuthUser = Depends(require_roles("MAKER", "CHECKER", "ADMIN", "AUDITOR")),
):
    """List customer charge slabs, optionally filtered by vendor."""
    db = SessionLocal()
    q = db.query(CustomerChargeSlab, VendorMaster.vendor_name, VendorMaster.vendor_code).outerjoin(
        VendorMaster, CustomerChargeSlab.vendor_id == VendorMaster.vendor_id
    )
    if vendor_id:
        q = q.filter(CustomerChargeSlab.vendor_id == vendor_id)
    rows = q.filter(CustomerChargeSlab.status == "ACTIVE").order_by(
        CustomerChargeSlab.vendor_id, CustomerChargeSlab.amount_from
    ).all()
    result = [
        {
            "slab_id": s.slab_id,
            "vendor_id": s.vendor_id,
            "vendor_name": name or "",
            "vendor_code": code or "",
            "amount_from": float(s.amount_from or 0),
            "amount_to": float(s.amount_to or 0),
            "charge_amount": float(s.charge_amount or 0),
            "slab_label": s.slab_label or "",
            "status": s.status,
            "effective_from": s.effective_from.isoformat() if s.effective_from else None,
        }
        for s, name, code in rows
    ]
    db.close()
    return result


@router.post("")
def create_customer_charge_slab(
    payload: dict,
    user: AuthUser = Depends(require_roles("MAKER", "ADMIN")),
):
    """Create a customer charge slab (admin/maker)."""
    vendor_id = payload.get("vendor_id")
    amount_from = payload.get("amount_from")
    amount_to = payload.get("amount_to")
    charge_amount = payload.get("charge_amount")
    slab_label = payload.get("slab_label") or ""
    effective_from = payload.get("effective_from")

    if vendor_id is None or amount_from is None or amount_to is None or charge_amount is None:
        raise HTTPException(status_code=400, detail="vendor_id, amount_from, amount_to, charge_amount required")

    db = SessionLocal()
    try:
        eff_from = (
            datetime.strptime(str(effective_from), "%Y-%m-%d").date()
            if effective_from
            else datetime.now().date()
        )
    except (ValueError, TypeError):
        eff_from = datetime.now().date()

    slab = CustomerChargeSlab(
        vendor_id=int(vendor_id),
        amount_from=float(amount_from),
        amount_to=float(amount_to),
        charge_amount=float(charge_amount),
        slab_label=slab_label,
        status="ACTIVE",
        effective_from=eff_from,
        created_by=user.employee_id,
    )
    db.add(slab)
    db.commit()
    db.refresh(slab)
    result = {
        "slab_id": slab.slab_id,
        "vendor_id": slab.vendor_id,
        "amount_from": float(slab.amount_from),
        "amount_to": float(slab.amount_to),
        "charge_amount": float(slab.charge_amount),
    }
    db.close()
    return result


@router.delete("/{slab_id}")
def delete_customer_charge_slab(
    slab_id: int,
    user: AuthUser = Depends(require_roles("ADMIN")),
):
    """Soft-delete (set INACTIVE) a customer charge slab.""" 
    db = SessionLocal()
    slab = db.query(CustomerChargeSlab).filter(CustomerChargeSlab.slab_id == slab_id).first()
    if not slab:
        db.close()
        raise HTTPException(status_code=404, detail="Slab not found")
    slab.status = "INACTIVE"
    db.commit()
    db.close()
    return {"status": "ok"}
