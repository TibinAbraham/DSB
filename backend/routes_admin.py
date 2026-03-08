from fastapi import APIRouter, Depends, HTTPException, status

from auth import AuthUser, require_roles
from audit import log_audit
from db import SessionLocal
from models import (
    ApprovalRequest,
    AuditLog,
    BankStoreMaster,
    CanonicalTransaction,
    ChargeConfigurationMaster,
    CustomerChargeSlab,
    CustomerChargeSummary,
    ExceptionRecord,
    FinacleInvalidRecord,
    FinacleRawStaging,
    FinacleUploadBatch,
    MonthLock,
    PickupRulesMaster,
    ReconciliationCorrection,
    ReconciliationResult,
    RemittanceEntry,
    VendorChargeMaster,
    VendorChargeSummary,
    VendorFileFormatConfig,
    VendorFileFormatHeaderMapping,
    VendorInvalidRecord,
    VendorMaster,
    VendorRawStaging,
    VendorStoreMappingMaster,
    VendorUploadBatch,
    WaiverMaster,
)
from schemas import AdminCleanupRequest, AdminResetAllRequest


router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/cleanup")
def cleanup_data(
    payload: AdminCleanupRequest,
    user: AuthUser = Depends(require_roles("ADMIN")),
):
    if not payload.reason or not payload.reason.strip():
        raise HTTPException(status_code=400, detail="Reason is required")
    if payload.confirm_text != "CONFIRM":
        raise HTTPException(status_code=400, detail='Type "CONFIRM" to proceed')

    allowed = {"UPLOADS", "TRANSACTIONS", "RECONCILIATION", "APPROVALS", "STORE_MAPPING", "VENDORS_STORES", "MASTERS", "CHARGES", "ALL"}
    targets = {target.strip().upper() for target in payload.targets or []}
    if not targets:
        raise HTTPException(status_code=400, detail="Select at least one target")
    if not targets.issubset(allowed):
        raise HTTPException(status_code=400, detail="Invalid cleanup target")
    if "ALL" in targets:
        targets = {"UPLOADS", "TRANSACTIONS", "RECONCILIATION", "APPROVALS", "VENDORS_STORES", "MASTERS", "CHARGES"}

    db = SessionLocal()
    deleted = {}

    def delete_model(model, label=None):
        count = db.query(model).delete(synchronize_session=False)
        deleted[label or model.__tablename__] = count

    if "UPLOADS" in targets:
        delete_model(VendorRawStaging)
        delete_model(VendorInvalidRecord)
        delete_model(VendorUploadBatch)
        delete_model(FinacleRawStaging)
        delete_model(FinacleInvalidRecord)
        delete_model(FinacleUploadBatch)

    if "TRANSACTIONS" in targets:
        delete_model(RemittanceEntry)
        delete_model(CanonicalTransaction)

    if "RECONCILIATION" in targets:
        delete_model(ExceptionRecord)
        delete_model(ReconciliationCorrection)
        delete_model(ReconciliationResult)

    if "APPROVALS" in targets:
        delete_model(ApprovalRequest)

    if "STORE_MAPPING" in targets:
        delete_model(VendorStoreMappingMaster)

    if "VENDORS_STORES" in targets:
        delete_model(VendorStoreMappingMaster)
        delete_model(VendorFileFormatHeaderMapping)
        delete_model(VendorFileFormatConfig)
        delete_model(VendorChargeMaster)
        delete_model(CustomerChargeSlab)
        delete_model(VendorMaster)
        delete_model(BankStoreMaster)

    if "MASTERS" in targets:
        delete_model(WaiverMaster)
        delete_model(PickupRulesMaster)
        delete_model(ChargeConfigurationMaster)

    if "CHARGES" in targets:
        delete_model(CustomerChargeSummary)
        delete_model(VendorChargeSummary)

    log_audit(
        db,
        "ADMIN_CLEANUP",
        "BATCH",
        "DELETE",
        None,
        f"targets={sorted(list(targets))}, reason={payload.reason}",
        user.employee_id,
    )
    db.commit()
    db.close()
    return {"deleted": deleted}


@router.post("/reset-all")
def reset_all(
    payload: AdminResetAllRequest,
    user: AuthUser = Depends(require_roles("ADMIN")),
):
    """Reset application completely: all data, audit logs, month locks. User accounts preserved."""
    if not payload.reason or not payload.reason.strip():
        raise HTTPException(status_code=400, detail="Reason is required")
    if payload.confirm_text != "RESET ALL":
        raise HTTPException(
            status_code=400,
            detail='Type "RESET ALL" (exactly) to proceed. This clears all application data.',
        )

    db = SessionLocal()
    deleted = {}

    def delete_model(model, label=None):
        count = db.query(model).delete(synchronize_session=False)
        deleted[label or model.__tablename__] = count

    # Order respects FK constraints
    delete_model(RemittanceEntry)
    delete_model(CanonicalTransaction)
    delete_model(ReconciliationCorrection)
    delete_model(ExceptionRecord)
    delete_model(ReconciliationResult)
    delete_model(ApprovalRequest)
    delete_model(VendorRawStaging)
    delete_model(VendorInvalidRecord)
    delete_model(VendorUploadBatch)
    delete_model(FinacleRawStaging)
    delete_model(FinacleInvalidRecord)
    delete_model(FinacleUploadBatch)
    delete_model(VendorStoreMappingMaster)
    delete_model(VendorFileFormatHeaderMapping)
    delete_model(VendorFileFormatConfig)
    delete_model(VendorChargeMaster)
    delete_model(CustomerChargeSlab)
    delete_model(VendorChargeSummary)
    delete_model(CustomerChargeSummary)
    delete_model(VendorMaster)
    delete_model(BankStoreMaster)
    delete_model(WaiverMaster)
    delete_model(PickupRulesMaster)
    delete_model(ChargeConfigurationMaster)
    delete_model(AuditLog)
    delete_model(MonthLock)

    db.commit()
    db.close()
    return {
        "deleted": deleted,
        "message": "Application reset complete. Refresh the page to clear client cache.",
    }
