"""Lizenzschlüssel für Download-Software (CLI, Desktop, Skripte)."""
import base64
import hashlib
import json
import os
import re
import secrets
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from ._errors import MonemeeError
from . import _http

KEY_RE = re.compile(r"^MM(-[A-Z0-9]{4}){4}$")
STORE_VERSION = 1
# Wird bei Veröffentlichung mit dem Produktiv-Schlüssel befüllt; sonst einmal online geholt.
BUNDLED_PUBLIC_KEYS = []


@dataclass
class LicenseResult:
    valid: bool
    reason: Optional[str] = None
    plan: Optional[str] = None
    expires_at: Optional[str] = None
    test: bool = False
    offline: bool = False
    activations: Optional[dict] = field(default=None)


def _default_dir(app_name):
    if os.name == "nt":
        base = Path(os.environ.get("APPDATA", Path.home()))
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    return base / app_name


def _parse_time(value):
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


def _b64url(data):
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def verify_signed(signed, public_keys):
    """Prüft signed["signature"] über den exakten String signed["payload"]. Payload-Dict oder None."""
    if not isinstance(signed, dict) or not isinstance(signed.get("payload"), str):
        return None
    jwk = next((k for k in public_keys or [] if k.get("kid") == signed.get("kid")), None)
    if not jwk:
        return None
    try:
        from cryptography.exceptions import InvalidSignature
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    except ImportError:
        return None  # pip install "monemee[offline]" für Offline-Prüfung
    try:
        Ed25519PublicKey.from_public_bytes(_b64url(jwk["x"])).verify(_b64url(signed["signature"]), signed["payload"].encode("utf-8"))
        return json.loads(signed["payload"])
    except (InvalidSignature, ValueError, KeyError):
        return None


class License:
    """Lizenz eines Produkts auf diesem Gerät.

    License(product_id=123, grace_days=7, app_name=None, base_url="https://monemee.com")
    """

    def __init__(self, product_id, base_url=None, grace_days=7, app_name=None, store_dir=None,
                 device_id=None, device_name=None, public_keys=None, now=None, timeout=8):
        self.product_id = int(product_id)
        if self.product_id <= 0:
            raise MonemeeError("product_id fehlt", code="CONFIG")
        self.base_url = (base_url or os.environ.get("MONEMEE_BASE_URL") or "https://monemee.com").rstrip("/")
        self.grace_seconds = grace_days * 86400
        self.dir = Path(store_dir) if store_dir else _default_dir(app_name or "monemee-%d" % self.product_id)
        self._device_id = device_id
        self.device_name = device_name
        self._keys = list(public_keys or []) + BUNDLED_PUBLIC_KEYS
        self._now = now or time.time
        self.timeout = timeout

    # ---------- Speicher ----------
    @property
    def _file(self):
        return self.dir / "license.json"

    def _load(self):
        try:
            data = json.loads(self._file.read_text("utf-8"))
            return data if isinstance(data, dict) else {}
        except (OSError, ValueError):
            return {}

    def _save(self, data):
        self.dir.mkdir(parents=True, exist_ok=True)
        tmp = self._file.with_suffix(".tmp")
        tmp.write_text(json.dumps(data), "utf-8")
        try:
            os.chmod(tmp, 0o600)
        except OSError:
            pass
        tmp.replace(self._file)

    def device_id(self):
        if self._device_id:
            return str(self._device_id)[:128]
        data = self._load()
        if not data.get("device"):
            data["device"] = "d_" + secrets.token_hex(16)
            self._save(data)
        return data["device"]

    # ---------- Netzwerk ----------
    def _post(self, path, body):
        res = _http.request("POST", "%s/api/v1/licenses/%s" % (self.base_url, path), body, timeout=self.timeout)
        return (res or {}).get("data") or {}

    def _ensure_keys(self, data):
        if self._keys:
            return
        if data.get("keys"):
            self._keys = data["keys"]
            return
        res = _http.request("GET", "%s/.well-known/monemee-license-keys.json" % self.base_url, timeout=self.timeout)
        self._keys = (res or {}).get("keys") or []
        if self._keys:
            data["keys"] = self._keys
            self._save(data)

    def _trusted(self, signed, key, device, max_age, data):
        try:
            self._ensure_keys(data)
        except MonemeeError:
            pass
        p = verify_signed(signed, self._keys)
        if not p:
            return None
        if p.get("product_id") != self.product_id or p.get("key_sha256") != hashlib.sha256(key.encode()).hexdigest():
            return None
        if p.get("device_id") and p["device_id"] != device:
            return None
        issued = _parse_time(p.get("issued_at"))
        now = self._now()
        if issued is None or issued > now + 300 or now - issued > max_age:
            return None
        expires = _parse_time(p.get("expires_at"))
        if expires is not None and expires < now:
            return dict(p, valid=False, reason="expired")
        return p

    @staticmethod
    def _result(d, **extra):
        valid = bool(d.get("valid"))
        return LicenseResult(valid=valid, reason=None if valid else d.get("reason"), plan=d.get("plan"),
                             expires_at=d.get("expires_at"), test=bool(d.get("test")), **extra)

    # ---------- Öffentliche API ----------
    def activate(self, key, device_name=None):
        """Schlüssel einmal aktivieren (bindet ihn an dieses Gerät)."""
        key = re.sub(r"\s+", "", str(key or "")).upper()
        if not KEY_RE.match(key):
            raise MonemeeError("Schlüssel im Format MM-XXXX-XXXX-XXXX-XXXX eingeben", code="INVALID_KEY")
        device = self.device_id()
        body = {"key": key, "product_id": self.product_id, "device_id": device}
        if device_name or self.device_name:
            body["device_name"] = device_name or self.device_name
        res = self._post("activate", body)
        if res.get("valid"):
            data = self._load()
            data.update({"v": STORE_VERSION, "key": key, "signed": res.get("signed"), "checked_at": self._now()})
            self._save(data)
        return self._result(res, activations=res.get("activations"))

    def check(self):
        """Gilt die Lizenz? Online prüfen, ohne Netz gilt die letzte signierte Antwort (grace_days)."""
        data = self._load()
        key = data.get("key")
        if not key:
            return LicenseResult(valid=False, reason="not_activated")
        device = self.device_id()
        try:
            res = self._post("validate", {"key": key, "product_id": self.product_id, "device_id": device})
        except MonemeeError as err:
            if err.code not in ("NETWORK", "SERVER"):
                raise
            p = self._trusted(data.get("signed"), key, device, self.grace_seconds, data) if data.get("signed") else None
            if not p:
                return LicenseResult(valid=False, reason="offline", offline=True)
            return self._result(p, offline=True)

        if res.get("signed"):
            p = self._trusted(res["signed"], key, device, 600, data)
            if p and bool(p.get("valid")) == bool(res.get("valid")):
                data.update({"signed": res["signed"], "checked_at": self._now()})
                self._save(data)
            elif self._keys:
                return LicenseResult(valid=False, reason="invalid_signature")
        if not res.get("valid") and res.get("reason") in ("revoked", "not_found", "product_mismatch"):
            for k in ("key", "signed", "checked_at"):
                data.pop(k, None)
            self._save(data)
        return self._result(res, activations=res.get("activations"))

    def deactivate(self):
        """Gerät freigeben und gespeicherten Schlüssel vergessen."""
        data = self._load()
        key = data.get("key")
        if not key:
            return False
        try:
            res = self._post("deactivate", {"key": key, "product_id": self.product_id, "device_id": self.device_id()})
        finally:
            for k in ("key", "signed", "checked_at"):
                data.pop(k, None)
            self._save(data)
        return bool(res.get("deactivated"))

    @property
    def stored_key(self):
        return self._load().get("key")
