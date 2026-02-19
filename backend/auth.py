import base64
import binascii
import hashlib
import hmac
import secrets
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

_HASH_PREFIX = "pbkdf2"
_HASH_ITERATIONS = 210_000
_SALT_BYTES = 16


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(_SALT_BYTES)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _HASH_ITERATIONS)
    salt_b64 = base64.urlsafe_b64encode(salt).decode("ascii").rstrip("=")
    hash_b64 = base64.urlsafe_b64encode(dk).decode("ascii").rstrip("=")
    return f"{_HASH_PREFIX}${_HASH_ITERATIONS}${salt_b64}${hash_b64}"


def _constant_time_equals(left: str, right: str) -> bool:
    return hmac.compare_digest(left.encode("utf-8"), right.encode("utf-8"))


def verify_password(password: str, stored: str) -> bool:
    if not stored or "$" not in stored:
        return _constant_time_equals(password, stored)

    parts = stored.split("$")
    if len(parts) != 4 or parts[0] != _HASH_PREFIX:
        return _constant_time_equals(password, stored)

    try:
        iterations = int(parts[1])
        salt = base64.urlsafe_b64decode(parts[2] + "==")
        expected = base64.urlsafe_b64decode(parts[3] + "==")
    except (ValueError, binascii.Error):
        return False

    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(dk, expected)


def authenticate(db: Session, employee_id: str, password: str) -> AuthUser | None:
    """
    Option 1: AD validates password, DB controls access and role.
    User must exist in user_account (provisioned by admin) to log in.
    Fallback: users with local password_hash (pbkdf2$) can still use local auth.
    """
    user = (
        db.query(UserAccount)
        .filter(UserAccount.employee_id == employee_id)
        .filter(UserAccount.status == "ACTIVE")
        .first()
    )
    if not user:
        return None

    if user.password_hash and user.password_hash.startswith("pbkdf2$"):
        if not verify_password(password, user.password_hash):
            return None
        return AuthUser(employee_id=user.employee_id, name=user.full_name, role=user.role_code)

    try:
        from ad_login import validate_ad_credentials

        ad_ok = validate_ad_credentials(employee_id, password)
    except Exception:
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
