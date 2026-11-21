import json
import urllib.error
import urllib.request

from ._errors import MonemeeError

USER_AGENT = "monemee-python/0.1.0"


def request(method, url, body=None, token=None, timeout=8):
    """JSON-Request mit der Standardbibliothek. Gibt das geparste JSON zurück."""
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", "application/json")
    req.add_header("User-Agent", USER_AGENT)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode("utf-8") or "null")
    except urllib.error.HTTPError as err:
        try:
            payload = json.loads(err.read().decode("utf-8"))
        except Exception:
            payload = {}
        raise MonemeeError(payload.get("message") or "HTTP %s" % err.code, code=payload.get("code") or "SERVER", status=err.code)
    except (urllib.error.URLError, TimeoutError, OSError) as err:
        raise MonemeeError("Monemee nicht erreichbar (%s)" % getattr(err, "reason", err), code="NETWORK")
