import json
from datetime import datetime

from fastapi import HTTPException, status

from auth import AuthUser


def safe_json_loads_clob(raw, default=None, raise_on_error=True):
    """
    Safely parse JSON from CLOB/Text column. Handles Oracle CLOB behavior on Windows
    (lazy load, LOB objects), empty/whitespace strings, and encoding issues.
    When raise_on_error=False, returns default on parse failure instead of raising.
    """
    if default is None:
        default = {}
    if raw is None:
        return default
    # Oracle CLOB may return LOB object on Windows - use .read() if available
    if hasattr(raw, "read"):
        raw = raw.read()
        if raw is None:
            return default
    s = str(raw).strip()
    # Strip BOM if present
    if s.startswith("\ufeff"):
        s = s[1:].strip()
    if not s:
        return default
    try:
        return json.loads(s)
    except json.JSONDecodeError as e:
        if raise_on_error:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Invalid approval data: could not parse proposed_data (len={len(s)}, preview={repr(s[:80])})",
            ) from e
        return default


def enforce_checker_rules(user: AuthUser, maker_id: str, checker_id: str, comment: str) -> None:
    if not comment or not comment.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Comment required")
    if checker_id != user.employee_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Checker mismatch")
    if maker_id == checker_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Maker cannot approve")


def init_comment_history(maker_comment: str | None, maker_id: str) -> str:
    history = []
    if maker_comment:
        history.append(
            {
                "role": "MAKER",
                "user_id": maker_id,
                "comment": maker_comment,
                "timestamp": datetime.utcnow().isoformat(),
            }
        )
    return json.dumps(history, default=str)


def append_comment_history(existing: str | None, role: str, user_id: str, comment: str) -> str:
    history = []
    if existing:
        try:
            # Handle Oracle CLOB on Windows - ensure string before json.loads
            raw = existing
            if hasattr(raw, "read"):
                raw = raw.read()
            s = (raw or "").strip() if raw is not None else ""
            if s:
                history = json.loads(s)
            if not isinstance(history, list):
                history = []
        except (json.JSONDecodeError, TypeError, AttributeError):
            history = []
    history.append(
        {
            "role": role,
            "user_id": user_id,
            "comment": comment,
            "timestamp": datetime.utcnow().isoformat(),
        }
    )
    return json.dumps(history, default=str)
