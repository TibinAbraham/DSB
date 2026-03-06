import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status

from auth import AuthUser, require_roles
from audit import log_audit
from db import SessionLocal
from models import ApprovalRequest, BankStoreMaster
from schemas import ApprovalDecision, BankStoreRequest
from utils_approval import append_comment_history, enforce_checker_rules, init_comment_history
from utils_month_lock import enforce_month_unlocked


router = APIRouter(prefix="/api/bank-stores", tags=["bank-stores"])


@router.get("")
def list_bank_stores(
    include_inactive: bool = False,
    user: AuthUser = Depends(require_roles("MAKER", "CHECKER", "ADMIN", "AUDITOR")),
):
    db = SessionLocal()
    query = db.query(BankStoreMaster)
    if not include_inactive:
        query = query.filter(BankStoreMaster.status == "ACTIVE")
    stores = query.all()
    result = [
        {
            "bank_store_code": s.bank_store_code,
            "store_name": s.store_name,
            "customer_id": s.customer_id,
            "customer_name": s.customer_name,
            "account_no": s.account_no,
            "status": s.status,
            "effective_from": s.effective_from,
        }
        for s in stores
    ]
    log_audit(db, "BANK_STORE_MASTER", "LIST", "VIEW", None, f"count={len(result)}", user.employee_id)
    db.commit()
    db.close()
    return result


@router.post("/requests")
def request_bank_store(payload: BankStoreRequest, user: AuthUser = Depends(require_roles("MAKER", "ADMIN"))):
    if payload.maker_id != user.employee_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Maker mismatch")

    db = SessionLocal()
    enforce_month_unlocked(db, payload.effective_from.strftime("%Y%m"))
    existing = db.query(BankStoreMaster).filter(BankStoreMaster.bank_store_code == payload.bank_store_code).first()
    if existing:
        db.close()
        raise HTTPException(status_code=400, detail="Bank store code already exists or pending approval")

    store = BankStoreMaster(
        bank_store_code=payload.bank_store_code,
        store_name=payload.store_name,
        customer_id=payload.customer_id or None,
        customer_name=payload.customer_name or None,
        account_no=payload.account_no or None,
        sol_id=payload.sol_id,
        daily_pickup_limit=payload.daily_pickup_limit,
        status="INACTIVE",
        effective_from=payload.effective_from,
        created_by=payload.maker_id,
    )
    db.add(store)
    db.flush()

    approval = ApprovalRequest(
        entity_type="BANK_STORE_MASTER",
        entity_id=store.store_id,
        original_data=json.dumps({}),
        proposed_data=json.dumps(payload.model_dump(), default=str),
        reason=payload.reason,
        comments_history=init_comment_history(payload.reason, payload.maker_id),
        maker_id=payload.maker_id,
        status="PENDING",
    )
    db.add(approval)
    db.flush()
    log_audit(db, "BANK_STORE_MASTER", store.store_id, "REQUEST", None, payload.model_dump(), user.employee_id)
    approval_id = approval.approval_id
    store_id = store.store_id
    db.commit()
    db.close()
    return {"approval_id": approval_id, "store_id": store_id}


@router.post("/requests/{approval_id}/approve")
def approve_bank_store(
    approval_id: int,
    decision: ApprovalDecision,
    user: AuthUser = Depends(require_roles("CHECKER", "ADMIN")),
):
    db = SessionLocal()
    approval = db.query(ApprovalRequest).filter(ApprovalRequest.approval_id == approval_id).first()
    if not approval or approval.entity_type != "BANK_STORE_MASTER":
        db.close()
        raise HTTPException(status_code=404, detail="Approval not found")
    enforce_checker_rules(user, approval.maker_id, decision.checker_id, decision.comment)

    store = db.query(BankStoreMaster).filter(BankStoreMaster.store_id == approval.entity_id).first()
    if not store:
        db.close()
        raise HTTPException(status_code=404, detail="Store not found")

    active = (
        db.query(BankStoreMaster)
        .filter(BankStoreMaster.bank_store_code == store.bank_store_code)
        .filter(BankStoreMaster.store_id != store.store_id)
        .filter(BankStoreMaster.status == "ACTIVE")
        .all()
    )
    for row in active:
        row.status = "INACTIVE"
        row.effective_to = store.effective_from - timedelta(days=1)

    store.status = "ACTIVE"
    store.approved_by = decision.checker_id
    store.approved_date = datetime.utcnow()
    approval.status = "APPROVED"
    approval.checker_id = decision.checker_id
    approval.checker_comment = decision.comment
    approval.comments_history = append_comment_history(
        approval.comments_history, "CHECKER", decision.checker_id, decision.comment
    )
    approval.approved_date = datetime.utcnow()

    log_audit(db, "BANK_STORE_MASTER", store.store_id, "APPROVE", None, decision.comment, user.employee_id)
    db.commit()
    db.close()
    return {"status": "APPROVED"}


@router.post("/requests/{approval_id}/reject")
def reject_bank_store(
    approval_id: int,
    decision: ApprovalDecision,
    user: AuthUser = Depends(require_roles("CHECKER", "ADMIN")),
):
    db = SessionLocal()
    approval = db.query(ApprovalRequest).filter(ApprovalRequest.approval_id == approval_id).first()
    if not approval or approval.entity_type != "BANK_STORE_MASTER":
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

    log_audit(db, "BANK_STORE_MASTER", approval.entity_id, "REJECT", None, decision.comment, user.employee_id)
    db.commit()
    db.close()
    return {"status": "REJECTED"}
