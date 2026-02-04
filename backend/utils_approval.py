import json
from datetime import datetime

from fastapi import HTTPException, status

from auth import AuthUser


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
            history = json.loads(existing)
        except json.JSONDecodeError:
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
