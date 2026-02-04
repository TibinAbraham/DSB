import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status

from auth import AuthUser, require_roles
from audit import log_audit
from db import SessionLocal
from models import ApprovalRequest, ExceptionRecord, ReconciliationCorrection, ReconciliationResult
from schemas import ApprovalDecision, CorrectionRequest
from utils_approval import append_comment_history, enforce_checker_rules, init_comment_history
from utils_month_lock import enforce_month_unlocked


router = APIRouter(prefix="/api/reconciliation/corrections", tags=["corrections"])


@router.post("/requests")
def request_correction(payload: CorrectionRequest, user: AuthUser = Depends(require_roles("MAKER", "ADMIN"))):
    if payload.maker_id != user.employee_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Maker mismatch")

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
    proposed_data = json.dumps(
        {
            "requested_action": payload.requested_action,
            "details": payload.details,
        }
    )

    approval = ApprovalRequest(
        entity_type="RECONCILIATION_CORRECTION",
        entity_id=0,
        original_data=json.dumps({}),
        proposed_data=proposed_data,
        reason=payload.reason,
        comments_history=init_comment_history(payload.reason, payload.maker_id),
        maker_id=payload.maker_id,
        status="PENDING",
    )
    db.add(approval)
    db.flush()
    approval_id = approval.approval_id

    correction = ReconciliationCorrection(
        recon_id=payload.recon_id,
        approval_id=approval_id,
        proposed_data=proposed_data,
        status="PENDING",
        maker_id=payload.maker_id,
    )
    db.add(correction)
    db.flush()
    correction_id = correction.correction_id

    approval.entity_id = correction_id

    log_audit(
        db,
        "RECONCILIATION_CORRECTION",
        correction.correction_id,
        "REQUEST",
        None,
        payload.model_dump(),
        user.employee_id,
    )
    db.commit()
    db.close()
    return {"approval_id": approval_id, "correction_id": correction_id}


@router.get("/by-approval/{approval_id}")
def get_by_approval(approval_id: int, user: AuthUser = Depends(require_roles("CHECKER", "ADMIN"))):
    db = SessionLocal()
    correction = (
        db.query(ReconciliationCorrection)
        .filter(ReconciliationCorrection.approval_id == approval_id)
        .first()
    )
    if not correction:
        db.close()
        raise HTTPException(status_code=404, detail="Correction not found")
    db.close()
    return {"correction_id": correction.correction_id}


@router.post("/requests/{approval_id}/approve")
def approve_correction(
    approval_id: int,
    decision: ApprovalDecision,
    user: AuthUser = Depends(require_roles("CHECKER", "ADMIN")),
):
    db = SessionLocal()
    approval = db.query(ApprovalRequest).filter(ApprovalRequest.approval_id == approval_id).first()
    if not approval or approval.entity_type != "RECONCILIATION_CORRECTION":
        db.close()
        raise HTTPException(status_code=404, detail="Approval not found")
    enforce_checker_rules(user, approval.maker_id, decision.checker_id, decision.comment)

    correction = (
        db.query(ReconciliationCorrection)
        .filter(ReconciliationCorrection.correction_id == approval.entity_id)
        .first()
    )
    if not correction:
        db.close()
        raise HTTPException(status_code=404, detail="Correction not found")

    recon = (
        db.query(ReconciliationResult)
        .filter(ReconciliationResult.recon_id == correction.recon_id)
        .first()
    )
    if not recon:
        db.close()
        raise HTTPException(status_code=404, detail="Reconciliation record not found")

    base_date = recon.remittance_date or recon.pickup_date
    if base_date:
        enforce_month_unlocked(db, base_date.strftime("%Y%m"))

    proposed = {}
    try:
        proposed = json.loads(correction.proposed_data or "{}")
    except json.JSONDecodeError:
        proposed = {}

    if proposed.get("requested_action") == "AMOUNT_EDIT":
        details = proposed.get("details")
        if isinstance(details, str):
            try:
                details = json.loads(details)
            except json.JSONDecodeError:
                details = {}
        details = details or {}

        old_data = {
            "pickup_amount": str(recon.pickup_amount) if recon.pickup_amount is not None else None,
            "remittance_amount": str(recon.remittance_amount)
            if recon.remittance_amount is not None
            else None,
            "status": recon.status,
            "reason": recon.reason,
        }

        new_vendor_amount = details.get("vendor_amount")
        new_finacle_amount = details.get("finacle_amount")

        recon.pickup_amount = new_vendor_amount
        recon.remittance_amount = new_finacle_amount

        if new_vendor_amount is not None and new_finacle_amount is not None and float(
            new_vendor_amount
        ) == float(new_finacle_amount):
            recon.status = "MATCHED"
            recon.reason = None
        else:
            recon.status = "AMOUNT_MISMATCH"
            recon.reason = "Amount mismatch after correction"

        if recon.status == "MATCHED":
            (
                db.query(ExceptionRecord)
                .filter(ExceptionRecord.recon_id == recon.recon_id)
                .filter(ExceptionRecord.status == "OPEN")
                .update(
                    {
                        "status": "RESOLVED",
                        "resolved_by": decision.checker_id,
                        "resolved_date": datetime.utcnow(),
                        "remarks": "Auto-resolved after amount correction",
                    }
                )
            )

        log_audit(
            db,
            "RECONCILIATION_RESULT",
            recon.recon_id,
            "AMOUNT_EDIT",
            json.dumps(old_data),
            json.dumps(
                {
                    "pickup_amount": new_vendor_amount,
                    "remittance_amount": new_finacle_amount,
                    "status": recon.status,
                    "reason": recon.reason,
                }
            ),
            user.employee_id,
        )

    correction.status = "APPROVED"
    correction.checker_id = decision.checker_id
    correction.approved_date = datetime.utcnow()
    approval.status = "APPROVED"
    approval.checker_id = decision.checker_id
    approval.checker_comment = decision.comment
    approval.comments_history = append_comment_history(
        approval.comments_history, "CHECKER", decision.checker_id, decision.comment
    )
    approval.approved_date = datetime.utcnow()

    log_audit(
        db,
        "RECONCILIATION_CORRECTION",
        correction.correction_id,
        "APPROVE",
        None,
        decision.comment,
        user.employee_id,
    )
    db.commit()
    db.close()
    return {"status": "APPROVED"}


@router.post("/requests/{approval_id}/reject")
def reject_correction(
    approval_id: int,
    decision: ApprovalDecision,
    user: AuthUser = Depends(require_roles("CHECKER", "ADMIN")),
):
    db = SessionLocal()
    approval = db.query(ApprovalRequest).filter(ApprovalRequest.approval_id == approval_id).first()
    if not approval or approval.entity_type != "RECONCILIATION_CORRECTION":
        db.close()
        raise HTTPException(status_code=404, detail="Approval not found")
    enforce_checker_rules(user, approval.maker_id, decision.checker_id, decision.comment)

    correction = (
        db.query(ReconciliationCorrection)
        .filter(ReconciliationCorrection.correction_id == approval.entity_id)
        .first()
    )
    if correction:
        correction.status = "REJECTED"
        correction.checker_id = decision.checker_id
        correction.approved_date = datetime.utcnow()

    approval.status = "REJECTED"
    approval.checker_id = decision.checker_id
    approval.checker_comment = decision.comment
    approval.comments_history = append_comment_history(
        approval.comments_history, "CHECKER", decision.checker_id, decision.comment
    )
    approval.approved_date = datetime.utcnow()

    log_audit(
        db,
        "RECONCILIATION_CORRECTION",
        approval.entity_id,
        "REJECT",
        None,
        decision.comment,
        user.employee_id,
    )
    db.commit()
    db.close()
    return {"status": "REJECTED"}
