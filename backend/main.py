from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from db import SessionLocal
from routes_vendor_file_format import router as vendor_file_format_router
from routes_uploads import router as uploads_router
from routes_store_mapping import router as store_mapping_router
from routes_reconciliation import router as reconciliation_router
from routes_approvals import router as approvals_router
from routes_corrections import router as corrections_router
from routes_pickup_rules import router as pickup_rules_router
from routes_charges import router as charges_router
from routes_month_lock import router as month_lock_router
from routes_reports import router as reports_router
from routes_auth import router as auth_router
from routes_vendor_master import router as vendor_master_router
from routes_bank_store import router as bank_store_router
from routes_charge_config import router as charge_config_router
from routes_vendor_charge import router as vendor_charge_router
from routes_waivers import router as waivers_router
from routes_remittances import router as remittances_router
from routes_exceptions import router as exceptions_router
from routes_admin import router as admin_router


app = FastAPI(title="Doorstep Banking Application")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(vendor_file_format_router)
app.include_router(uploads_router)
app.include_router(store_mapping_router)
app.include_router(reconciliation_router)
app.include_router(approvals_router)
app.include_router(corrections_router)
app.include_router(pickup_rules_router)
app.include_router(charges_router)
app.include_router(month_lock_router)
app.include_router(reports_router)
app.include_router(auth_router)
app.include_router(vendor_master_router)
app.include_router(bank_store_router)
app.include_router(charge_config_router)
app.include_router(vendor_charge_router)
app.include_router(waivers_router)
app.include_router(remittances_router)
app.include_router(exceptions_router)
app.include_router(admin_router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


@app.get("/api/health/db")
def health_check_db():
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1 FROM dual"))
        return {"status": "ok", "db": "ok"}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database check failed: {exc}",
        ) from exc
    finally:
        db.close()
