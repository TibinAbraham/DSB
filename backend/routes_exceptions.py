import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status

from auth import AuthUser, require_roles
from audit import log_audit
from db import SessionLocal
from models import ApprovalRequest, ExceptionRecord, ReconciliationResult
from schemas import ApprovalDecision, ExceptionRequest, ExceptionResolutionRequest
from utils_approval import append_comment_history, enforce_checker_rules, init_comment_history
from utils_month_lock import enforce_month_unlocked


router = APIRouter(prefix="/api/exceptions", tags=["exceptions"])


@router.get("")
def list_exceptions(
    status_filter: str | None = None,
    user: AuthUser = Depends(require_roles("MAKER", "CHECKER", "ADMIN", "AUDITOR")),
):
    db = SessionLocal()
    recon = (
        db.query(ReconciliationResult)
        .filter(ReconciliationResult.recon_id == payload.recon_id)
        .first()
    )
    if not recon:
        db.close()
        raise HTTPException(status_code=404, detail="Reconciliation record not found")
    base_date = recon.remittance_date or recon.pickup_date
    if base_date:
        enforce_month_unlocked(db, base_date.strftime("%Y%m"))
    query = db.query(ExceptionRecord)
    if status_filter:
        query = query.filter(ExceptionRecord.status == status_filter)
    rows = query.order_by(ExceptionRecord.exception_id.desc()).all()
    result = [
        {
            "exception_id": r.exception_id,
            "recon_id": r.recon_id,
            "exception_type": r.exception_type,
            "status": r.status,
        }
        for r in rows
    ]
    log_audit(db, "EXCEPTION", "LIST", "VIEW", None, f"count={len(result)}", user.employee_id)
    db.commit()
    db.close()
    return result


@router.post("")
def create_exception(payload: ExceptionRequest, user: AuthUser = Depends(require_roles("MAKER", "ADMIN"))):
    if payload.maker_id != user.employee_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Maker mismatch")

    db = SessionLocal()
    record = ExceptionRecord(
        recon_id=payload.recon_id,
        exception_type=payload.exception_type,
        details=payload.details,
        status="OPEN",
        created_by=payload.maker_id,
    )
    db.add(record)
    log_audit(db, "EXCEPTION", payload.recon_id, "CREATE", None, payload.model_dump(), user.employee_id)
    db.commit()
    db.close()
    return {"exception_id": record.exception_id, "status": record.status}


@router.post("/requests")
def request_resolution(
    payload: ExceptionResolutionRequest, user: AuthUser = Depends(require_roles("MAKER", "ADMIN"))
):
    if payload.maker_id != user.employee_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Maker mismatch")
    db = SessionLocal()
    record = db.query(ExceptionRecord).filter(ExceptionRecord.exception_id == payload.exception_id).first()
    if not record:
        db.close()
        raise HTTPException(status_code=404, detail="Exception not found")
    recon = (
        db.query(ReconciliationResult)
        .filter(ReconciliationResult.recon_id == record.recon_id)
        .first()
    )
    if recon:
        base_date = recon.remittance_date or recon.pickup_date
        if base_date:
            enforce_month_unlocked(db, base_date.strftime("%Y%m"))

    approval = ApprovalRequest(
        entity_type="EXCEPTION_RESOLUTION",
        entity_id=record.exception_id,
        original_data=json.dumps({"status": record.status}),
        proposed_data=json.dumps(payload.model_dump(), default=str),
        reason=payload.reason,
        comments_history=init_comment_history(payload.reason, payload.maker_id),
        maker_id=payload.maker_id,
        status="PENDING",
    )
    db.add(approval)
    log_audit(db, "EXCEPTION", record.exception_id, "REQUEST", None, payload.model_dump(), user.employee_id)
    db.commit()
    db.close()
    return {"approval_id": approval.approval_id}


@router.post("/requests/{approval_id}/approve")
def approve_resolution(
    approval_id: int,
    decision: ApprovalDecision,
    user: AuthUser = Depends(require_roles("CHECKER", "ADMIN")),
):
    db = SessionLocal()
    approval = db.query(ApprovalRequest).filter(ApprovalRequest.approval_id == approval_id).first()
    if not approval or approval.entity_type != "EXCEPTION_RESOLUTION":
        db.close()
        raise HTTPException(status_code=404, detail="Approval not found")
    enforce_checker_rules(user, approval.maker_id, decision.checker_id, decision.comment)

    record = db.query(ExceptionRecord).filter(ExceptionRecord.exception_id == approval.entity_id).first()
    if not record:
        db.close()
        raise HTTPException(status_code=404, detail="Exception not found")
    record.status = "RESOLVED"
    record.resolved_by = decision.checker_id
    record.resolved_date = datetime.utcnow()
    approval.status = "APPROVED"
    approval.checker_id = decision.checker_id
    approval.checker_comment = decision.comment
    approval.comments_history = append_comment_history(
        approval.comments_history, "CHECKER", decision.checker_id, decision.comment
    )
    approval.approved_date = datetime.utcnow()
    log_audit(db, "EXCEPTION", record.exception_id, "APPROVE", None, decision.comment, user.employee_id)
    db.commit()
    db.close()
    return {"status": "APPROVED"}


@router.post("/requests/{approval_id}/reject")
def reject_resolution(
    approval_id: int,
    decision: ApprovalDecision,
    user: AuthUser = Depends(require_roles("CHECKER", "ADMIN")),
):
    db = SessionLocal()
    approval = db.query(ApprovalRequest).filter(ApprovalRequest.approval_id == approval_id).first()
    if not approval or approval.entity_type != "EXCEPTION_RESOLUTION":
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
    log_audit(db, "EXCEPTION", approval.entity_id, "REJECT", None, decision.comment, user.employee_id)
    db.commit()
    db.close()
    return {"status": "REJECTED"}
