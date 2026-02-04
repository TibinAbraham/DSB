from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status

from auth import AuthUser, require_roles
from audit import log_audit
from db import SessionLocal
from models import ApprovalRequest
from schemas import ApprovalDecision, CommentRequest
from utils_approval import append_comment_history


router = APIRouter(prefix="/api/approvals", tags=["approvals"])


@router.get("/pending")
def list_pending(user: AuthUser = Depends(require_roles("CHECKER", "ADMIN"))):
    db = SessionLocal()
    approvals = (
        db.query(ApprovalRequest)
        .filter(ApprovalRequest.status == "PENDING")
        .order_by(ApprovalRequest.created_date.desc())
        .all()
    )
    payload = [
        {
            "approval_id": item.approval_id,
            "entity_type": item.entity_type,
            "entity_id": item.entity_id,
            "maker_id": item.maker_id,
            "status": item.status,
            "created_date": item.created_date,
            "reason": item.reason,
            "checker_comment": item.checker_comment,
            "comments_history": item.comments_history,
            "original_data": item.original_data,
            "proposed_data": item.proposed_data,
        }
        for item in approvals
    ]
    log_audit(
        db,
        entity_type="APPROVAL",
        entity_id="LIST",
        action="VIEW",
        old_data=None,
        new_data=f"count={len(payload)}",
        changed_by=user.employee_id,
    )
    db.commit()
    db.close()
    return payload


@router.get("/clarifications")
def list_clarifications(user: AuthUser = Depends(require_roles("MAKER", "ADMIN"))):
    db = SessionLocal()
    approvals = (
        db.query(ApprovalRequest)
        .filter(ApprovalRequest.status == "CLARIFICATION")
        .filter(ApprovalRequest.maker_id == user.employee_id)
        .order_by(ApprovalRequest.created_date.desc())
        .all()
    )
    payload = [
        {
            "approval_id": item.approval_id,
            "entity_type": item.entity_type,
            "maker_id": item.maker_id,
            "status": item.status,
            "created_date": item.created_date,
            "reason": item.reason,
            "checker_comment": item.checker_comment,
            "comments_history": item.comments_history,
        }
        for item in approvals
    ]
    log_audit(
        db,
        entity_type="APPROVAL",
        entity_id="CLARIFICATIONS",
        action="VIEW",
        old_data=None,
        new_data=f"count={len(payload)}",
        changed_by=user.employee_id,
    )
    db.commit()
    db.close()
    return payload


@router.post("/{approval_id}/clarify")
def request_clarification(
    approval_id: int,
    decision: ApprovalDecision,
    user: AuthUser = Depends(require_roles("CHECKER", "ADMIN")),
):
    db = SessionLocal()
    approval = db.query(ApprovalRequest).filter(ApprovalRequest.approval_id == approval_id).first()
    if not approval:
        db.close()
        raise HTTPException(status_code=404, detail="Approval not found")
    if approval.status != "PENDING":
        db.close()
        raise HTTPException(status_code=400, detail="Only pending approvals can be clarified")

    approval.status = "CLARIFICATION"
    approval.checker_id = decision.checker_id
    approval.checker_comment = decision.comment
    approval.comments_history = append_comment_history(
        approval.comments_history, "CHECKER", decision.checker_id, decision.comment
    )
    approval.approved_date = datetime.utcnow()

    log_audit(db, "APPROVAL", approval_id, "CLARIFY", None, decision.comment, user.employee_id)
    db.commit()
    db.close()
    return {"status": "CLARIFICATION"}


@router.post("/{approval_id}/resubmit")
def resubmit_approval(
    approval_id: int,
    payload: CommentRequest,
    user: AuthUser = Depends(require_roles("MAKER", "ADMIN")),
):
    db = SessionLocal()
    approval = db.query(ApprovalRequest).filter(ApprovalRequest.approval_id == approval_id).first()
    if not approval:
        db.close()
        raise HTTPException(status_code=404, detail="Approval not found")
    if approval.maker_id != user.employee_id:
        db.close()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Maker mismatch")
    if approval.status != "CLARIFICATION":
        db.close()
        raise HTTPException(status_code=400, detail="Only clarification requests can be resubmitted")
    if not payload.comment or not payload.comment.strip():
        db.close()
        raise HTTPException(status_code=400, detail="Comment required")

    approval.status = "PENDING"
    approval.checker_id = None
    approval.checker_comment = None
    approval.comments_history = append_comment_history(
        approval.comments_history, "MAKER", user.employee_id, payload.comment
    )
    approval.approved_date = None

    log_audit(db, "APPROVAL", approval_id, "RESUBMIT", None, None, user.employee_id)
    db.commit()
    db.close()
    return {"status": "PENDING"}
