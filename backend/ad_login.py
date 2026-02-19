"""
Bank AD login via SOAP. Validates username/password against bank SSO endpoint.
Configure via env: AD_SOAP_ENDPOINT, AD_SOAP_ACTION, AD_VERIFY_SSL, AD_TIMEOUT
"""

import html as html_escape
import os
import re
import xml.etree.ElementTree as ET

import requests

SOAP_ENDPOINT = os.environ.get(
    "AD_SOAP_ENDPOINT",
    "https://10.250.7.210:443/SSO/ADLogin.asmx",
)
SOAP_ACTION = os.environ.get("AD_SOAP_ACTION", "http://tempuri.org/userAttributes")
VERIFY_SSL = os.environ.get("AD_VERIFY_SSL", "false").lower() in ("true", "1", "yes")
TIMEOUT_SEC = int(os.environ.get("AD_TIMEOUT", "30"))


def _send_soap(envelope: str, headers: dict):
    try:
        resp = requests.post(
            SOAP_ENDPOINT,
            data=envelope.encode("utf-8"),
            headers=headers,
            timeout=TIMEOUT_SEC,
            verify=VERIFY_SSL,
        )
        return (resp.ok, resp.status_code, resp.text or "")
    except requests.RequestException as e:
        return (False, 0, str(e))


def _interpret_login_success(xml_text: str, http_status: int) -> bool:
    if http_status < 200 or http_status >= 300:
        return False

    if re.search(r"(<|\w+:)?Fault\b", xml_text, re.IGNORECASE):
        return False

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return False

    all_text = " ".join([t.strip() for t in root.itertext() if t.strip()]).lower()

    for tag in ("isAuthenticated", "Authenticated", "IsAuthenticated"):
        for el in root.iter():
            if el.tag and el.tag.lower().endswith(tag.lower()):
                val = (el.text or "").strip().lower()
                if val in ("true", "1", "yes"):
                    return True
                if val in ("false", "0", "no"):
                    return False

    for tag in ("Status", "Result", "Outcome", "AuthStatus"):
        for el in root.iter():
            if el.tag and el.tag.lower().endswith(tag.lower()):
                val = (el.text or "").strip().lower()
                if "success" in val or val in ("ok", "valid"):
                    return True
                if any(bad in val for bad in ("fail", "invalid", "error", "unauth", "denied")):
                    return False

    for tag in ("ErrorCode", "ErrCode", "Code"):
        for el in root.iter():
            if el.tag and el.tag.lower().endswith(tag.lower()):
                val = (el.text or "").strip()
                if val.isdigit():
                    return int(val) == 0

    common_ad_fields = (
        "samaccountname",
        "displayname",
        "mail",
        "userprincipalname",
        "givenname",
        "sn",
        "mobile",
        "employeeeid",
    )
    if any(field in all_text for field in common_ad_fields):
        if not re.search(
            r"\binvalid\b|\bfail\b|\berror\b|\bdenied\b|\bunauthor",
            all_text,
        ):
            return True

    return False


def validate_ad_credentials(username: str, password: str) -> bool:
    """
    Validate username/password against Bank AD SOAP endpoint.
    Returns True if AD authentication succeeds, False otherwise.
    """
    username = (username or "").strip()
    password = password or ""

    if not username or not password:
        return False

    soap12_env = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n'
        ' xmlns:xsd="http://www.w3.org/2001/XMLSchema"\n'
        ' xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">\n'
        "  <soap12:Body>\n"
        '    <userAttributes xmlns="http://tempuri.org/">\n'
        "      <username>{username}</username>\n"
        "      <password>{password}</password>\n"
        "    </userAttributes>\n"
        "  </soap12:Body>\n"
        "</soap12:Envelope>"
    ).format(
        username=html_escape.escape(username),
        password=html_escape.escape(password),
    )

    soap11_env = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n'
        ' xmlns:xsd="http://www.w3.org/2001/XMLSchema"\n'
        ' xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">\n'
        "  <soap:Body>\n"
        '    <userAttributes xmlns="http://tempuri.org/">\n'
        "      <username>{username}</username>\n"
        "      <password>{password}</password>\n"
        "    </userAttributes>\n"
        "  </soap:Body>\n"
        "</soap:Envelope>"
    ).format(
        username=html_escape.escape(username),
        password=html_escape.escape(password),
    )

    headers_12 = {
        "Content-Type": f'application/soap+xml; charset=utf-8; action="{SOAP_ACTION}"'
    }
    ok, status, xml_text = _send_soap(soap12_env, headers_12)

    if status in (415, 500) and not ok:
        headers_11 = {
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": SOAP_ACTION,
        }
        ok2, status2, xml_text2 = _send_soap(soap11_env, headers_11)
        ok, status, xml_text = ok2, status2, xml_text2

    return _interpret_login_success(xml_text, status)
