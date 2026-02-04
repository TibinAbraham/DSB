import json

from models import AuditLog


def _to_number(value):
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _to_text(value):
    if value is None:
        return None
    if isinstance(value, (dict, list, tuple)):
        return json.dumps(value, default=str)
    return str(value)


def log_audit(db, entity_type, entity_id, action, old_data, new_data, changed_by):
    entry = AuditLog(
        entity_type=entity_type,
        entity_id=_to_number(entity_id),
        action=action,
        old_data=_to_text(old_data),
        new_data=_to_text(new_data),
        changed_by=changed_by,
    )
    db.add(entry)
    return entry
