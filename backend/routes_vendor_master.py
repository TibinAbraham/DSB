import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status

from auth import AuthUser, require_roles
from audit import log_audit
from db import SessionLocal
from models import ApprovalRequest, VendorMaster
from schemas import ApprovalDecision, VendorMasterRequest
from utils_approval import append_comment_history, enforce_checker_rules, init_comment_history
from utils_month_lock import enforce_month_unlocked


router = APIRouter(prefix="/api/vendors", tags=["vendors"])


@router.get("")
def list_vendors(
    include_inactive: bool = False,
    user: AuthUser = Depends(require_roles("MAKER", "CHECKER", "ADMIN", "AUDITOR")),
):
    db = SessionLocal()
    query = db.query(VendorMaster)
    if not include_inactive:
        query = query.filter(VendorMaster.status == "ACTIVE")
    vendors = query.all()
    result = [
        {"vendor_id": v.vendor_id, "name": v.vendor_name, "code": v.vendor_code, "status": v.status}
        for v in vendors
    ]
    log_audit(db, "VENDOR_MASTER", "LIST", "VIEW", None, f"count={len(result)}", user.employee_id)
    db.commit()
    db.close()
    return result


@router.post("")
def request_vendor(payload: VendorMasterRequest, user: AuthUser = Depends(require_roles("MAKER", "ADMIN"))):
    if payload.maker_id != user.employee_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Maker mismatch")

    db = SessionLocal()
    enforce_month_unlocked(db, payload.effective_from.strftime("%Y%m"))
    existing = db.query(VendorMaster).filter(VendorMaster.vendor_code == payload.vendor_code).first()
    if existing:
        db.close()
        raise HTTPException(status_code=400, detail="Vendor code already exists or pending approval")

    vendor = VendorMaster(
        vendor_name=payload.vendor_name,
        vendor_code=payload.vendor_code,
        status="INACTIVE",
        effective_from=payload.effective_from,
        created_by=payload.maker_id,
    )
    db.add(vendor)
    db.flush()

    approval = ApprovalRequest(
        entity_type="VENDOR_MASTER",
        entity_id=vendor.vendor_id,
        original_data=json.dumps({}),
        proposed_data=json.dumps(payload.model_dump(), default=str),
        reason=payload.reason,
        comments_history=init_comment_history(payload.reason, payload.maker_id),
        maker_id=payload.maker_id,
        status="PENDING",
    )
    db.add(approval)
    db.flush()
    approval_id = approval.approval_id
    vendor_id = vendor.vendor_id
    log_audit(db, "VENDOR_MASTER", vendor.vendor_id, "REQUEST", None, payload.model_dump(), user.employee_id)
    db.commit()
    db.close()
    return {"approval_id": approval_id, "vendor_id": vendor_id}


@router.post("/requests/{approval_id}/approve")
def approve_vendor(
    approval_id: int,
    decision: ApprovalDecision,
    user: AuthUser = Depends(require_roles("CHECKER", "ADMIN")),
):
    db = SessionLocal()
    approval = db.query(ApprovalRequest).filter(ApprovalRequest.approval_id == approval_id).first()
    if not approval or approval.entity_type != "VENDOR_MASTER":
        db.close()
        raise HTTPException(status_code=404, detail="Approval not found")
    enforce_checker_rules(user, approval.maker_id, decision.checker_id, decision.comment)

    vendor = db.query(VendorMaster).filter(VendorMaster.vendor_id == approval.entity_id).first()
    if not vendor:
        db.close()
        raise HTTPException(status_code=404, detail="Vendor not found")

    active = (
        db.query(VendorMaster)
        .filter(VendorMaster.vendor_code == vendor.vendor_code)
        .filter(VendorMaster.vendor_id != vendor.vendor_id)
        .filter(VendorMaster.status == "ACTIVE")
        .all()
    )
    for row in active:
        row.status = "INACTIVE"
        row.effective_to = vendor.effective_from - timedelta(days=1)

    vendor.status = "ACTIVE"
    vendor.approved_by = decision.checker_id
    vendor.approved_date = datetime.utcnow()
    approval.status = "APPROVED"
    approval.checker_id = decision.checker_id
    approval.checker_comment = decision.comment
    approval.comments_history = append_comment_history(
        approval.comments_history, "CHECKER", decision.checker_id, decision.comment
    )
    approval.approved_date = datetime.utcnow()

    log_audit(db, "VENDOR_MASTER", vendor.vendor_id, "APPROVE", None, decision.comment, user.employee_id)
    db.commit()
    db.close()
    return {"status": "APPROVED"}


@router.post("/requests/{approval_id}/reject")
def reject_vendor(
    approval_id: int,
    decision: ApprovalDecision,
    user: AuthUser = Depends(require_roles("CHECKER", "ADMIN")),
):
    db = SessionLocal()
    approval = db.query(ApprovalRequest).filter(ApprovalRequest.approval_id == approval_id).first()
    if not approval or approval.entity_type != "VENDOR_MASTER":
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

    log_audit(db, "VENDOR_MASTER", approval.entity_id, "REJECT", None, decision.comment, user.employee_id)
    db.commit()
    db.close()
    return {"status": "REJECTED"}
