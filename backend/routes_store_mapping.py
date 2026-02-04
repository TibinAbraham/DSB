import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status

from auth import AuthUser, require_roles
from audit import log_audit
from db import SessionLocal
from models import ApprovalRequest, VendorMaster, VendorStoreMappingMaster
from schemas import ApprovalDecision, StoreMappingDeactivateRequest, StoreMappingRequest
from utils_approval import append_comment_history, enforce_checker_rules, init_comment_history
from utils_month_lock import enforce_month_unlocked


router = APIRouter(prefix="/api/store-mappings", tags=["store-mappings"])


@router.get("")
def list_mappings(
    include_inactive: bool = False,
    user: AuthUser = Depends(require_roles("MAKER", "CHECKER", "ADMIN", "AUDITOR")),
):
    db = SessionLocal()
    enforce_month_unlocked(db, datetime.utcnow().strftime("%Y%m"))
    query = db.query(VendorStoreMappingMaster)
    if not include_inactive:
        query = query.filter(VendorStoreMappingMaster.status == "ACTIVE")
    mappings = query.all()
    mapping_ids = [m.mapping_id for m in mappings]
    approval_map = {}
    approval_action = {}
    if mapping_ids:
        approvals = (
            db.query(ApprovalRequest)
            .filter(ApprovalRequest.entity_type == "STORE_MAPPING")
            .filter(ApprovalRequest.entity_id.in_(mapping_ids))
            .order_by(ApprovalRequest.created_date.desc())
            .all()
        )
        for approval in approvals:
            if approval.entity_id not in approval_map:
                approval_map[approval.entity_id] = approval.status
                try:
                    proposed = json.loads(approval.proposed_data) if approval.proposed_data else {}
                    approval_action[approval.entity_id] = proposed.get("action")
                except json.JSONDecodeError:
                    approval_action[approval.entity_id] = None
    result = [
        {
            "mapping_id": m.mapping_id,
            "vendor_id": m.vendor_id,
            "vendor_store_code": m.vendor_store_code,
            "bank_store_code": m.bank_store_code,
            "customer_id": m.customer_id,
            "customer_name": m.customer_name,
            "account_no": m.account_no,
            "status": m.status,
            "effective_from": m.effective_from,
            "approval_status": approval_map.get(m.mapping_id),
            "approval_action": approval_action.get(m.mapping_id),
        }
        for m in mappings
    ]
    log_audit(db, "STORE_MAPPING", "LIST", "VIEW", None, f"count={len(result)}", user.employee_id)
    db.commit()
    db.close()
    return result


@router.post("/requests")
def request_mapping(payload: StoreMappingRequest, user: AuthUser = Depends(require_roles("MAKER", "ADMIN"))):
    if payload.maker_id != user.employee_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Maker mismatch")

    db = SessionLocal()
    approvals = []
    for row in payload.mappings:
        vendor = db.query(VendorMaster).filter(VendorMaster.vendor_id == row.vendor_id).first()
        if not vendor:
            db.close()
            raise HTTPException(status_code=404, detail="Vendor not found")
        mapping = VendorStoreMappingMaster(
            vendor_id=row.vendor_id,
            vendor_store_code=row.vendor_store_code,
            bank_store_code=row.bank_store_code,
            customer_id=row.customer_id,
            customer_name=row.customer_name,
            account_no=row.account_no,
            status="INACTIVE",
            effective_from=row.effective_from or datetime.utcnow().date(),
            created_by=payload.maker_id,
        )
        db.add(mapping)
        db.flush()
        approval = ApprovalRequest(
            entity_type="STORE_MAPPING",
            entity_id=mapping.mapping_id,
            original_data=json.dumps({}),
            proposed_data=json.dumps(row.model_dump(), default=str),
            reason=payload.reason,
            comments_history=init_comment_history(payload.reason, payload.maker_id),
            maker_id=payload.maker_id,
            status="PENDING",
        )
        db.add(approval)
        approvals.append(approval.approval_id)

    log_audit(
        db,
        "STORE_MAPPING",
        "BATCH",
        "REQUEST",
        None,
        f"count={len(payload.mappings)}",
        user.employee_id,
    )
    db.commit()
    db.close()
    return {"approval_ids": approvals}


@router.post("/requests/{approval_id}/approve")
def approve_mapping(
    approval_id: int,
    decision: ApprovalDecision,
    user: AuthUser = Depends(require_roles("CHECKER", "ADMIN")),
):
    db = SessionLocal()
    approval = db.query(ApprovalRequest).filter(ApprovalRequest.approval_id == approval_id).first()
    if not approval or approval.entity_type != "STORE_MAPPING":
        db.close()
        raise HTTPException(status_code=404, detail="Approval not found")
    enforce_checker_rules(user, approval.maker_id, decision.checker_id, decision.comment)

    mapping = (
        db.query(VendorStoreMappingMaster)
        .filter(VendorStoreMappingMaster.mapping_id == approval.entity_id)
        .first()
    )
    if not mapping:
        db.close()
        raise HTTPException(status_code=404, detail="Mapping not found")

    action = None
    try:
        proposed = json.loads(approval.proposed_data) if approval.proposed_data else {}
        action = proposed.get("action")
    except json.JSONDecodeError:
        action = None

    if action == "DEACTIVATE":
        mapping.status = "INACTIVE"
        mapping.effective_to = datetime.utcnow().date()
        mapping.approved_by = decision.checker_id
        mapping.approved_date = datetime.utcnow()
        approval.status = "APPROVED"
        approval.checker_id = decision.checker_id
        approval.checker_comment = decision.comment
        approval.comments_history = append_comment_history(
            approval.comments_history, "CHECKER", decision.checker_id, decision.comment
        )
        approval.approved_date = datetime.utcnow()
        log_audit(db, "STORE_MAPPING", mapping.mapping_id, "DEACTIVATE", None, decision.comment, user.employee_id)
        db.commit()
        db.close()
        return {"status": "APPROVED"}

    active = (
        db.query(VendorStoreMappingMaster)
        .filter(VendorStoreMappingMaster.vendor_id == mapping.vendor_id)
        .filter(VendorStoreMappingMaster.vendor_store_code == mapping.vendor_store_code)
        .filter(VendorStoreMappingMaster.mapping_id != mapping.mapping_id)
        .filter(VendorStoreMappingMaster.status == "ACTIVE")
        .all()
    )
    for row in active:
        row.status = "INACTIVE"
        row.effective_to = mapping.effective_from - timedelta(days=1)

    mapping.status = "ACTIVE"
    mapping.approved_by = decision.checker_id
    mapping.approved_date = datetime.utcnow()
    approval.status = "APPROVED"
    approval.checker_id = decision.checker_id
    approval.checker_comment = decision.comment
    approval.comments_history = append_comment_history(
        approval.comments_history, "CHECKER", decision.checker_id, decision.comment
    )
    approval.approved_date = datetime.utcnow()

    log_audit(db, "STORE_MAPPING", mapping.mapping_id, "APPROVE", None, decision.comment, user.employee_id)
    db.commit()
    db.close()
    return {"status": "APPROVED"}


@router.post("/requests/{mapping_id}/deactivate")
def request_deactivate_mapping(
    mapping_id: int,
    payload: StoreMappingDeactivateRequest,
    user: AuthUser = Depends(require_roles("MAKER", "ADMIN")),
):
    if payload.maker_id != user.employee_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Maker mismatch")

    db = SessionLocal()
    mapping = (
        db.query(VendorStoreMappingMaster)
        .filter(VendorStoreMappingMaster.mapping_id == mapping_id)
        .first()
    )
    if not mapping:
        db.close()
        raise HTTPException(status_code=404, detail="Mapping not found")

    approval = ApprovalRequest(
        entity_type="STORE_MAPPING",
        entity_id=mapping.mapping_id,
        original_data=json.dumps(
            {
                "vendor_id": mapping.vendor_id,
                "vendor_store_code": mapping.vendor_store_code,
                "bank_store_code": mapping.bank_store_code,
                "customer_id": mapping.customer_id,
                "customer_name": mapping.customer_name,
                "account_no": mapping.account_no,
                "status": mapping.status,
            },
            default=str,
        ),
        proposed_data=json.dumps({"action": "DEACTIVATE"}, default=str),
        reason=payload.reason,
        comments_history=init_comment_history(payload.reason, payload.maker_id),
        maker_id=payload.maker_id,
        status="PENDING",
    )
    db.add(approval)
    db.flush()
    approval_id = approval.approval_id

    log_audit(
        db,
        "STORE_MAPPING",
        mapping.mapping_id,
        "DEACTIVATE_REQUEST",
        None,
        payload.reason,
        user.employee_id,
    )
    db.commit()
    db.close()
    return {"approval_id": approval_id}


@router.post("/requests/{approval_id}/reject")
def reject_mapping(
    approval_id: int,
    decision: ApprovalDecision,
    user: AuthUser = Depends(require_roles("CHECKER", "ADMIN")),
):
    db = SessionLocal()
    approval = db.query(ApprovalRequest).filter(ApprovalRequest.approval_id == approval_id).first()
    if not approval or approval.entity_type != "STORE_MAPPING":
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

    log_audit(db, "STORE_MAPPING", approval.entity_id, "REJECT", None, decision.comment, user.employee_id)
    db.commit()
    db.close()
    return {"status": "REJECTED"}
