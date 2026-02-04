from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth import AuthUser, authenticate, get_current_user, issue_token
from audit import log_audit
from db import SessionLocal
from models import UserAccount


router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    employeeId: str
    password: str


@router.post("/login")
def login(payload: LoginRequest):
    db = SessionLocal()
    user = authenticate(db, payload.employeeId, payload.password)
    if not user:
        log_audit(
            db,
            entity_type="AUTH",
            entity_id=None,
            action="LOGIN_FAILED",
            old_data=None,
            new_data=f"employee_id={payload.employeeId}",
            changed_by=payload.employeeId,
        )
        db.commit()
        db.close()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = issue_token(user)
    db_user = (
        db.query(UserAccount)
        .filter(UserAccount.employee_id == payload.employeeId)
        .first()
    )
    if db_user:
        db_user.last_login_date = datetime.utcnow()
    log_audit(
        db,
        entity_type="AUTH",
        entity_id=None,
        action="LOGIN",
        old_data=None,
        new_data=f"employee_id={user.employee_id}",
        changed_by=user.employee_id,
    )
    db.commit()
    db.close()
    return {"token": token, "employeeId": user.employee_id, "name": user.name, "role": user.role}


@router.get("/me")
def me(user: AuthUser = Depends(get_current_user)):
    db = SessionLocal()
    log_audit(
        db,
        entity_type="AUTH",
        entity_id=None,
        action="ME",
        old_data=None,
        new_data=f"employee_id={user.employee_id}",
        changed_by=user.employee_id,
    )
    db.commit()
    db.close()
    return {"employeeId": user.employee_id, "name": user.name, "role": user.role}
