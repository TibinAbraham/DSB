import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status

from auth import AuthUser, require_roles
from audit import log_audit
from db import SessionLocal
from models import ApprovalRequest, VendorChargeMaster
from schemas import ApprovalDecision, VendorChargeRequest
from utils_approval import append_comment_history, enforce_checker_rules, init_comment_history
from utils_month_lock import enforce_month_unlocked


router = APIRouter(prefix="/api/vendor-charges", tags=["vendor-charges"])


@router.post("/requests")
def request_vendor_charge(
    payload: VendorChargeRequest, user: AuthUser = Depends(require_roles("MAKER", "ADMIN"))
):
    if payload.maker_id != user.employee_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Maker mismatch")

    db = SessionLocal()
    enforce_month_unlocked(db, payload.effective_from.strftime("%Y%m"))
    charge = VendorChargeMaster(
        vendor_id=payload.vendor_id,
        pickup_type=payload.pickup_type,
        base_charge=payload.base_charge,
        status="INACTIVE",
        effective_from=payload.effective_from,
        created_by=payload.maker_id,
    )
    db.add(charge)
    db.flush()

    approval = ApprovalRequest(
        entity_type="VENDOR_CHARGE",
        entity_id=charge.vendor_charge_id,
        original_data=json.dumps({}),
        proposed_data=json.dumps(payload.model_dump(), default=str),
        reason=payload.reason,
        comments_history=init_comment_history(payload.reason, payload.maker_id),
        maker_id=payload.maker_id,
        status="PENDING",
    )
    db.add(approval)
    log_audit(db, "VENDOR_CHARGE", charge.vendor_charge_id, "REQUEST", None, payload.model_dump(), user.employee_id)
    db.commit()
    db.close()
    return {"approval_id": approval.approval_id, "vendor_charge_id": charge.vendor_charge_id}


@router.post("/requests/{approval_id}/approve")
def approve_vendor_charge(
    approval_id: int,
    decision: ApprovalDecision,
    user: AuthUser = Depends(require_roles("CHECKER", "ADMIN")),
):
    db = SessionLocal()
    approval = db.query(ApprovalRequest).filter(ApprovalRequest.approval_id == approval_id).first()
    if not approval or approval.entity_type != "VENDOR_CHARGE":
        db.close()
        raise HTTPException(status_code=404, detail="Approval not found")
    enforce_checker_rules(user, approval.maker_id, decision.checker_id, decision.comment)

    charge = db.query(VendorChargeMaster).filter(VendorChargeMaster.vendor_charge_id == approval.entity_id).first()
    if not charge:
        db.close()
        raise HTTPException(status_code=404, detail="Charge not found")

    active = (
        db.query(VendorChargeMaster)
        .filter(VendorChargeMaster.vendor_id == charge.vendor_id)
        .filter(VendorChargeMaster.pickup_type == charge.pickup_type)
        .filter(VendorChargeMaster.vendor_charge_id != charge.vendor_charge_id)
        .filter(VendorChargeMaster.status == "ACTIVE")
        .all()
    )
    for row in active:
        row.status = "INACTIVE"
        row.effective_to = charge.effective_from - timedelta(days=1)

    charge.status = "ACTIVE"
    charge.approved_by = decision.checker_id
    charge.approved_date = datetime.utcnow()
    approval.status = "APPROVED"
    approval.checker_id = decision.checker_id
    approval.checker_comment = decision.comment
    approval.comments_history = append_comment_history(
        approval.comments_history, "CHECKER", decision.checker_id, decision.comment
    )
    approval.approved_date = datetime.utcnow()

    log_audit(db, "VENDOR_CHARGE", charge.vendor_charge_id, "APPROVE", None, decision.comment, user.employee_id)
    db.commit()
    db.close()
    return {"status": "APPROVED"}


@router.post("/requests/{approval_id}/reject")
def reject_vendor_charge(
    approval_id: int,
    decision: ApprovalDecision,
    user: AuthUser = Depends(require_roles("CHECKER", "ADMIN")),
):
    db = SessionLocal()
    approval = db.query(ApprovalRequest).filter(ApprovalRequest.approval_id == approval_id).first()
    if not approval or approval.entity_type != "VENDOR_CHARGE":
        db.close()
        raise HTTPException(status_code=404, detail="Approval not found")
    enforce_checker_rules(user, approval.maker_id, decision.checker_id, decision.comment)

    approval.status = "REJECTED"
    approval.checker_id = decision.checker_id
    approval.checker_comment = decision.comment
    approval.comments_history = append_comment_history(
        approval.comments_history, "CHECKER", decision.checker_id, decision.comment
    )
    approval.approved_date = datetime.utcnow()

    log_audit(db, "VENDOR_CHARGE", approval.entity_id, "REJECT", None, decision.comment, user.employee_id)
    db.commit()
    db.close()
    return {"status": "REJECTED"}
