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
    # === AD/LDAP login example (comment only) ===
    # Replace the local password check with an AD bind, e.g.:
    #
    # def ad_bind_ok(employee_id: str, password: str) -> bool:
    #     # Example only: use ldap3 or ldap3 + TLS as per bank policy
    #     # server = Server("ldap://10.x.x.x", get_info=ALL)
    #     # conn = Connection(server, user=f"DOMAIN\\{employee_id}", password=password, auto_bind=True)
    #     # return conn.bound
    #     return True
    #
    # if not ad_bind_ok(employee_id, password):
    #     return None
    #
    # After AD auth, fetch the user's role from local DB (user_account):
    # user = db.query(UserAccount).filter(UserAccount.employee_id == employee_id).first()
    # if not user or user.status != "ACTIVE":
    #     return None
    # return AuthUser(employee_id=user.employee_id, name=user.full_name, role=user.role_code)
    # === end example ===
    user = (
        db.query(UserAccount)
        .filter(UserAccount.employee_id == employee_id)
        .filter(UserAccount.status == "ACTIVE")
        .first()
    )
    if not user:
        return None
    if not verify_password(password, user.password_hash):
        return None
    if "$" not in user.password_hash:
        user.password_hash = hash_password(password)
        db.commit()
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
