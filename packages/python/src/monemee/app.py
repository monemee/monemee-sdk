"""Zugang für Web-Apps mit Login (Flask, FastAPI, Django …)."""
import os
import re
import threading
import time
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlencode

from ._errors import MonemeeError
from . import _http
from .webhook import verify_webhook

SECRET_RE = re.compile(r"^mmapp_(test|live)_[0-9A-Za-z]{32}$")
REF_RE = re.compile(r"^[A-Za-z0-9._:@-]{1,128}$")
CACHE_EVENTS = {"license.created", "license.revoked", "license.activated", "sale.completed"}


@dataclass
class AccessResult:
    access: bool
    reason: Optional[str] = None
    plan: Optional[str] = None
    expires_at: Optional[str] = None
    test: bool = False


class App:
    """App(app_secret=None, product_id=None, webhook_secret=None, cache_seconds=300)

    Werte kommen standardmäßig aus MONEMEE_APP_SECRET, MONEMEE_PRODUCT_ID,
    MONEMEE_WEBHOOK_SECRET, MONEMEE_BASE_URL.
    """

    def __init__(self, app_secret=None, product_id=None, webhook_secret=None, base_url=None, cache_seconds=300, timeout=8):
        self.app_secret = app_secret or os.environ.get("MONEMEE_APP_SECRET", "")
        if not SECRET_RE.match(self.app_secret):
            raise MonemeeError("MONEMEE_APP_SECRET fehlt oder ist ungültig (npx monemee init oder Dashboard → App-Anbindung)", code="CONFIG")
        self.mode = "test" if self.app_secret.startswith("mmapp_test_") else "live"
        self.product_id = product_id or os.environ.get("MONEMEE_PRODUCT_ID")
        self.webhook_secret = webhook_secret or os.environ.get("MONEMEE_WEBHOOK_SECRET")
        self.base_url = (base_url or os.environ.get("MONEMEE_BASE_URL") or "https://monemee.com").rstrip("/")
        self.cache_seconds = cache_seconds
        self.timeout = timeout
        self._cache = {}
        self._lock = threading.Lock()

    def _api(self, method, path, body=None):
        res = _http.request(method, "%s/api/v1/apps%s" % (self.base_url, path), body, token=self.app_secret, timeout=self.timeout)
        return (res or {}).get("data") or {}

    @staticmethod
    def _ref(ref):
        ref = str(ref).strip() if ref is not None else ""
        if not REF_RE.match(ref):
            raise MonemeeError("ref muss eine Nutzer-ID sein (max. 128 Zeichen aus A-Z a-z 0-9 . _ : @ -)", code="INVALID_REF")
        return ref

    @staticmethod
    def _result(d):
        return AccessResult(access=bool(d.get("access")), reason=d.get("reason"), plan=d.get("plan"),
                            expires_at=d.get("expires_at"), test=bool(d.get("test")))

    def access(self, ref):
        ref = self._ref(ref)
        with self._lock:
            hit = self._cache.get(ref)
            if hit and hit[1] > time.time():
                return hit[0]
        result = self._result(self._api("POST", "/access", {"ref": ref}))
        if self.cache_seconds > 0:
            with self._lock:
                self._cache[ref] = (result, time.time() + self.cache_seconds)
        return result

    def has_access(self, ref):
        return self.access(ref).access

    def unlock(self, ref, claim=None, key=None):
        """Rücksprung-Token (?monemee_claim=…) oder Lizenzschlüssel einlösen und an ref binden."""
        ref = self._ref(ref)
        if not claim and not key:
            raise MonemeeError("claim oder key ist erforderlich", code="INVALID_INPUT")
        body = {"ref": ref}
        if claim:
            body["claim"] = claim
        else:
            body["key"] = key
        result = self._result(self._api("POST", "/claim", body))
        with self._lock:
            self._cache.pop(ref, None)
        return result

    def buy_url(self, ref=None):
        if not self.product_id:
            self.product_id = self._api("GET", "/me").get("product_id")
        url = "%s/buy/%s" % (self.base_url, self.product_id)
        return url + ("?" + urlencode({"ref": self._ref(ref)}) if ref not in (None, "") else "")

    def test_buy_url(self, ref, return_url=None):
        if self.mode != "test":
            raise MonemeeError("Testkäufe gehen nur mit einem Test-Secret (mmapp_test_…)", code="TEST_ONLY")
        body = {"ref": self._ref(ref)}
        if return_url:
            body["return_url"] = return_url
        return self._api("POST", "/test-claim", body).get("redirectUrl")

    def handle_webhook(self, raw_body, signature_header):
        """Signatur prüfen (roher Body!), Cache leeren. Gibt das Event zurück; ValueError bei falscher Signatur."""
        event = verify_webhook(raw_body, signature_header, self.webhook_secret)
        ref = (event.get("data") or {}).get("external_ref")
        if ref and event.get("event") in CACHE_EVENTS:
            with self._lock:
                self._cache.pop(ref, None)
        return event
