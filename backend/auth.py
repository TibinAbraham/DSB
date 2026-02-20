import logging
import uuid
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from db import SessionLocal
from models import UserAccount


@dataclass
class AuthUser:
    employee_id: str
    name: str
    role: str


_TOKEN_STORE: dict[str, AuthUser] = {}


def authenticate(db: Session, employee_id: str, password: str) -> AuthUser | None:
    """
    AD validates password, DB controls access and role.
    User must exist in user_account (provisioned by admin) to log in.
    """
    user = (
        db.query(UserAccount)
        .filter(UserAccount.employee_id == employee_id)
        .filter(UserAccount.status == "ACTIVE")
        .first()
    )
    if not user:
        return None

    try:
        from ad_login import validate_ad_credentials

        ad_ok = validate_ad_credentials(employee_id, password)
    except Exception as e:
        logging.getLogger(__name__).warning("AD validation error: %s", e)
        ad_ok = False

    if not ad_ok:
        return None

    return AuthUser(employee_id=user.employee_id, name=user.full_name, role=user.role_code)


def issue_token(user: AuthUser) -> str:
    token = str(uuid.uuid4())
    _TOKEN_STORE[token] = user
    return token


def get_current_user(request: Request) -> AuthUser:
    header = request.headers.get("Authorization")
    if not header or not header.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    token = header.replace("Bearer ", "").strip()
    user = _TOKEN_STORE.get(token)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    db = SessionLocal()
    try:
        active = (
            db.query(UserAccount)
            .filter(UserAccount.employee_id == user.employee_id)
            .filter(UserAccount.status == "ACTIVE")
            .first()
        )
        if not active:
            _TOKEN_STORE.pop(token, None)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return user
    finally:
        db.close()


def require_roles(*roles: str):
    def _dependency(user: AuthUser = Depends(get_current_user)) -> AuthUser:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        return user

    return _dependency
