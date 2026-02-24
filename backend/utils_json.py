"""
JSON string sanitization for cross-platform compatibility (Mac/Windows).
Fixes encoding, BOM, Unicode control chars, and RTL overrides that cause
display corruption on Windows Chrome.
"""
import json
import re

# Unicode control chars that corrupt JSON display (especially on Windows)
# BOM, RTL override, LTR/RTL marks, zero-width chars, directional isolates
_CONTROL_CHARS = re.compile(
    r"[\uFEFF\u202E\u202F\u200E\u200F\u200B\u200C\u200D\u2066\u2067\u2068\u2069\u202C]"
)


def sanitize_json_string(value: str | None) -> str:
    """
    Sanitize JSON string for storage and display.
    Strips BOM, removes Unicode control chars, normalizes line endings, validates JSON.
    """
    if value is None or not isinstance(value, str):
        return "{}"
    s = value.strip()
    if not s:
        return "{}"
    # Strip BOM
    if s.startswith("\ufeff"):
        s = s[1:]
    # Remove problematic Unicode control characters
    s = _CONTROL_CHARS.sub("", s)
    # Normalize line endings to LF (avoids CRLF issues on Windows)
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    # Validate and re-serialize for clean output
    try:
        obj = json.loads(s)
        return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)
    except json.JSONDecodeError:
        return s.strip()


def sanitize_json_for_display(value: str | None) -> str:
    """
    Sanitize JSON for display in textarea. Pretty-prints if valid.
    """
    if value is None or not isinstance(value, str):
        return "{}"
    s = sanitize_json_string(value)
    print(s, "sanitiseds")
    if s == "{}":
        return "{}"
    try:
        obj = json.loads(s)
        return json.dumps(obj, indent=2, ensure_ascii=False)
    except json.JSONDecodeError:
        return s
