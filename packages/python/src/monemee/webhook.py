import hashlib
import hmac
import json
import time


def verify_webhook(raw_body, signature_header, secret, tolerance_seconds=300, now=None):
    """Prüft einen Monemee-Webhook und gibt das Event zurück.

    raw_body: der UNVERÄNDERTE Body (bytes oder str)
    signature_header: Wert von "Monemee-Signature" (t=<unix>,v1=<hex>)
    Wirft ValueError bei fehlender, falscher oder zu alter Signatur.
    """
    if not secret:
        raise ValueError("Webhook-Secret fehlt (MONEMEE_WEBHOOK_SECRET)")
    if not signature_header:
        raise ValueError("Monemee-Signature-Header fehlt")
    parts = dict(p.strip().split("=", 1) for p in signature_header.split(",") if "=" in p)
    try:
        t = int(parts.get("t", ""))
    except ValueError:
        raise ValueError("Signatur hat ein ungültiges Format")
    v1 = parts.get("v1", "")
    if len(v1) != 64:
        raise ValueError("Signatur hat ein ungültiges Format")
    if abs(int(now if now is not None else time.time()) - t) > tolerance_seconds:
        raise ValueError("Signatur ist zu alt")
    body = raw_body.decode("utf-8") if isinstance(raw_body, (bytes, bytearray)) else str(raw_body)
    expected = hmac.new(secret.encode("utf-8"), ("%d.%s" % (t, body)).encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, v1):
        raise ValueError("Signatur stimmt nicht")
    return json.loads(body)
