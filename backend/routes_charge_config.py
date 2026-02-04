import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status

from auth import AuthUser, require_roles
from audit import log_audit
from db import SessionLocal
from models import ApprovalRequest, ChargeConfigurationMaster
from schemas import ApprovalDecision, ChargeConfigRequest
from utils_approval import append_comment_history, enforce_checker_rules, init_comment_history
from utils_month_lock import enforce_month_unlocked


router = APIRouter(prefix="/api/charge-configs", tags=["charge-configs"])


@router.get("")
def list_charge_configs(user: AuthUser = Depends(require_roles("MAKER", "CHECKER", "ADMIN", "AUDITOR"))):
    db = SessionLocal()
    enforce_month_unlocked(db, payload.effective_from.strftime("%Y%m"))
    configs = db.query(ChargeConfigurationMaster).filter(ChargeConfigurationMaster.status == "ACTIVE").all()
    result = [
        {
            "config_code": c.config_code,
            "config_name": c.config_name,
            "value_number": float(c.value_number) if c.value_number is not None else None,
            "status": c.status,
        }
        for c in configs
    ]
    log_audit(db, "CHARGE_CONFIG", "LIST", "VIEW", None, f"count={len(result)}", user.employee_id)
    db.commit()
    db.close()
    return result


@router.post("/requests")
def request_charge_config(payload: ChargeConfigRequest, user: AuthUser = Depends(require_roles("MAKER", "ADMIN"))):
    if payload.maker_id != user.employee_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Maker mismatch")

    db = SessionLocal()
    config = ChargeConfigurationMaster(
        config_code=payload.config_code,
        config_name=payload.config_name,
        value_number=payload.value_number,
        value_text=payload.value_text,
        status="INACTIVE",
        effective_from=payload.effective_from,
        created_by=payload.maker_id,
    )
    db.add(config)
    db.flush()

    approval = ApprovalRequest(
        entity_type="CHARGE_CONFIG",
        entity_id=config.config_id,
        original_data=json.dumps({}),
        proposed_data=json.dumps(payload.model_dump(), default=str),
        reason=payload.reason,
        comments_history=init_comment_history(payload.reason, payload.maker_id),
        maker_id=payload.maker_id,
        status="PENDING",
    )
    db.add(approval)
    log_audit(db, "CHARGE_CONFIG", config.config_id, "REQUEST", None, payload.model_dump(), user.employee_id)
    db.commit()
    db.close()
    return {"approval_id": approval.approval_id, "config_id": config.config_id}


@router.post("/requests/{approval_id}/approve")
def approve_charge_config(
    approval_id: int,
    decision: ApprovalDecision,
    user: AuthUser = Depends(require_roles("CHECKER", "ADMIN")),
):
    db = SessionLocal()
    approval = db.query(ApprovalRequest).filter(ApprovalRequest.approval_id == approval_id).first()
    if not approval or approval.entity_type != "CHARGE_CONFIG":
        db.close()
        raise HTTPException(status_code=404, detail="Approval not found")
    enforce_checker_rules(user, approval.maker_id, decision.checker_id, decision.comment)

    config = db.query(ChargeConfigurationMaster).filter(ChargeConfigurationMaster.config_id == approval.entity_id).first()
    if not config:
        db.close()
        raise HTTPException(status_code=404, detail="Config not found")

    active = (
        db.query(ChargeConfigurationMaster)
        .filter(ChargeConfigurationMaster.config_code == config.config_code)
        .filter(ChargeConfigurationMaster.config_id != config.config_id)
        .filter(ChargeConfigurationMaster.status == "ACTIVE")
        .all()
    )
    for row in active:
        row.status = "INACTIVE"
        row.effective_to = config.effective_from - timedelta(days=1)

    config.status = "ACTIVE"
    config.approved_by = decision.checker_id
    config.approved_date = datetime.utcnow()
    approval.status = "APPROVED"
    approval.checker_id = decision.checker_id
    approval.checker_comment = decision.comment
    approval.comments_history = append_comment_history(
        approval.comments_history, "CHECKER", decision.checker_id, decision.comment
    )
    approval.approved_date = datetime.utcnow()

    log_audit(db, "CHARGE_CONFIG", config.config_id, "APPROVE", None, decision.comment, user.employee_id)
    db.commit()
    db.close()
    return {"status": "APPROVED"}


@router.post("/requests/{approval_id}/reject")
def reject_charge_config(
    approval_id: int,
    decision: ApprovalDecision,
    user: AuthUser = Depends(require_roles("CHECKER", "ADMIN")),
):
    db = SessionLocal()
    approval = db.query(ApprovalRequest).filter(ApprovalRequest.approval_id == approval_id).first()
    if not approval or approval.entity_type != "CHARGE_CONFIG":
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

    log_audit(db, "CHARGE_CONFIG", approval.entity_id, "REJECT", None, decision.comment, user.employee_id)
    db.commit()
    db.close()
    return {"status": "REJECTED"}
