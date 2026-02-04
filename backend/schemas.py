from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class ApprovalDecision(BaseModel):
    checker_id: str
    comment: str


class CommentRequest(BaseModel):
    comment: str


class UploadResponse(BaseModel):
    batch_id: int
    total_rows: int
    invalid_rows: int
    status: str


class VendorFileFormatRequest(BaseModel):
    vendor_id: int
    format_name: str
    header_mapping_json: str
    effective_from: date
    status: str
    maker_id: str
    reason: Optional[str] = None


class VendorFileFormatResponse(BaseModel):
    config_id: int
    vendor_id: int
    format_name: str
    header_mapping_json: str
    status: str
    effective_from: date


class StoreMappingRow(BaseModel):
    vendor_id: int
    vendor_store_code: str
    bank_store_code: str
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    account_no: Optional[str] = None
    effective_from: Optional[date] = None


class StoreMappingRequest(BaseModel):
    mappings: list[StoreMappingRow]
    maker_id: str
    reason: Optional[str] = None


class StoreMappingDeactivateRequest(BaseModel):
    maker_id: str
    reason: Optional[str] = None


class AdminCleanupRequest(BaseModel):
    targets: list[str]
    reason: str
    confirm_text: str


class StoreMappingResponse(BaseModel):
    mapping_id: int
    vendor_id: int
    vendor_store_code: str
    bank_store_code: str
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    account_no: Optional[str] = None


class ReconciliationResultResponse(BaseModel):
    recon_id: int
    bank_store_code: str
    pickup_date: Optional[date]
    remittance_date: Optional[date]
    pickup_amount: Optional[float]
    remittance_amount: Optional[float]
    status: str
    reason: Optional[str] = None


class CorrectionRequest(BaseModel):
    recon_id: int
    requested_action: str
    details: Optional[str] = None
    maker_id: str
    reason: Optional[str] = None


class CorrectionResponse(BaseModel):
    correction_id: int
    recon_id: int
    requested_action: str
    details: Optional[str]
    status: str


class PickupRuleRequest(BaseModel):
    pickup_type: str
    free_limit: Optional[float] = None
    effective_from: date
    status: str
    maker_id: str
    reason: Optional[str] = None


class PickupRuleResponse(BaseModel):
    rule_id: int
    pickup_type: str
    free_limit: Optional[float] = None
    status: str
    effective_from: date


class MonthLockRequest(BaseModel):
    lock_month: str


class MonthLockResponse(BaseModel):
    lock_id: int
    lock_month: str
    locked_by: str
    locked_at: datetime


class VendorMasterRequest(BaseModel):
    vendor_name: str
    vendor_code: str
    status: str
    effective_from: date
    maker_id: str
    reason: Optional[str] = None


class VendorMasterResponse(BaseModel):
    vendor_id: int
    name: str
    code: str
    status: str


class BankStoreRequest(BaseModel):
    bank_store_code: str
    store_name: Optional[str] = None
    sol_id: Optional[str] = None
    daily_pickup_limit: Optional[float] = None
    effective_from: date
    status: str
    maker_id: str
    reason: Optional[str] = None


class BankStoreResponse(BaseModel):
    bank_store_code: str
    store_name: Optional[str]
    status: str
    effective_from: date


class ChargeConfigRequest(BaseModel):
    config_code: str
    config_name: str
    value_number: Optional[float] = None
    value_text: Optional[str] = None
    effective_from: date
    status: str
    maker_id: str
    reason: Optional[str] = None


class ChargeConfigResponse(BaseModel):
    config_code: str
    config_name: str
    value_number: Optional[float]
    status: str


class VendorChargeRequest(BaseModel):
    vendor_id: int
    pickup_type: str
    base_charge: float
    effective_from: date
    status: str
    maker_id: str
    reason: Optional[str] = None


class VendorChargeResponse(BaseModel):
    vendor_id: int
    pickup_type: str
    base_charge: float
    status: str


class WaiverRequest(BaseModel):
    customer_id: str
    waiver_type: str
    waiver_percentage: Optional[float] = None
    waiver_cap_amount: Optional[float] = None
    waiver_from: date
    waiver_to: Optional[date] = None
    status: str
    maker_id: str
    reason: Optional[str] = None


class WaiverResponse(BaseModel):
    waiver_id: int
    customer_id: str
    waiver_type: str
    status: str


class RemittanceRequest(BaseModel):
    canonical_ids: list[int]
    maker_id: str
    reason: Optional[str] = None


class RemittanceStatusRequest(BaseModel):
    remittance_id: int
    maker_id: str
    reason: Optional[str] = None


class RemittanceApprovalRequest(BaseModel):
    remittance_id: int
    action: str
    maker_id: str
    rejection_reason: Optional[str] = None
    reason: Optional[str] = None


class RemittanceResponse(BaseModel):
    remittance_id: int
    canonical_id: int
    source: str
    status: str


class ExceptionRequest(BaseModel):
    recon_id: int
    exception_type: str
    details: Optional[str] = None
    maker_id: str
    reason: Optional[str] = None


class ExceptionResolutionRequest(BaseModel):
    exception_id: int
    proposed_status: str
    remarks: Optional[str] = None
    maker_id: str
    reason: Optional[str] = None


class ExceptionResponse(BaseModel):
    exception_id: int
    recon_id: int
    exception_type: str
    status: str
