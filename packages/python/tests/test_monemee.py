import base64
import hashlib
import hmac
import json
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey  # noqa: E402
from cryptography.hazmat.primitives import serialization  # noqa: E402

from monemee import App, License, MonemeeError, verify_webhook  # noqa: E402

PRIV = Ed25519PrivateKey.generate()
X = base64.urlsafe_b64encode(PRIV.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)).rstrip(b"=").decode()
KEY = "MM-A7K2-9FQ3-XT8M-2B4C"
PID = 42
SECRET = "mmapp_test_" + "a" * 32


EVIL = Ed25519PrivateKey.generate()


def signed(fields, priv=None):
    payload = dict(v=1, key_sha256=hashlib.sha256(KEY.encode()).hexdigest(), product_id=PID, device_id=None,
                   valid=True, reason=None, plan="pro", expires_at=None, test=False,
                   issued_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))
    payload.update(fields)
    text = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    sig = base64.urlsafe_b64encode((priv or PRIV).sign(text.encode())).rstrip(b"=").decode()
    return {"payload": text, "signature": sig, "kid": "test-1", "alg": "EdDSA"}


class Fake:
    valid = True
    reason = None
    access = False
    evil = False
    calls = []


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.endswith("monemee-license-keys.json"):
            return self._json({"keys": [{"kid": "test-1", "x": X, "kty": "OKP", "crv": "Ed25519"}]})
        if self.path == "/api/v1/apps/me":
            return self._json({"success": True, "data": {"product_id": 7}})
        self._json({}, 404)

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])) or b"{}")
        Fake.calls.append((self.path, body, self.headers.get("Authorization")))
        if self.path.startswith("/api/v1/licenses/"):
            if self.path.endswith("deactivate"):
                return self._json({"success": True, "data": {"deactivated": True}})
            data = {"valid": Fake.valid, "reason": None if Fake.valid else Fake.reason, "product_id": PID, "plan": "pro"}
            data["signed"] = signed({"device_id": body.get("device_id"), "valid": Fake.valid, "reason": data["reason"]},
                                    EVIL if Fake.evil and self.path.endswith("validate") else None)
            return self._json({"success": True, "data": data})
        if self.path == "/api/v1/apps/access":
            return self._json({"success": True, "data": {"access": Fake.access, "reason": None if Fake.access else "no_license", "ref": body["ref"]}})
        if self.path == "/api/v1/apps/claim":
            Fake.access = True
            return self._json({"success": True, "data": {"access": True, "plan": "pro", "ref": body["ref"]}})
        if self.path == "/api/v1/apps/test-claim":
            return self._json({"success": True, "data": {"redirectUrl": (body.get("return_url") or "https://x/r") + "?monemee_claim=mmc_t"}})
        self._json({}, 404)


class Base(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), Handler)
        cls.base = "http://127.0.0.1:%d" % cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        Fake.valid, Fake.reason, Fake.access, Fake.evil, Fake.calls = True, None, False, False, []
        self.dir = tempfile.mkdtemp()


class LicenseTests(Base):
    def lic(self, **kw):
        return License(product_id=PID, base_url=kw.pop("base_url", self.base), store_dir=self.dir, **kw)

    def test_activate_check_online(self):
        lic = self.lic()
        self.assertTrue(lic.activate(" mm-a7k2-9fq3-xt8m-2b4c ").valid)
        self.assertEqual(Fake.calls[0][1]["key"], KEY)
        r = lic.check()
        self.assertTrue(r.valid)
        self.assertEqual(r.plan, "pro")
        self.assertFalse(r.offline)
        self.assertEqual(lic.stored_key, KEY)

    def test_offline_grace(self):
        t = [time.time()]
        lic = self.lic(now=lambda: t[0], grace_days=7)
        lic.activate(KEY)
        lic.check()
        off = License(product_id=PID, base_url="http://127.0.0.1:1", store_dir=self.dir, now=lambda: t[0], timeout=1)
        r = off.check()
        self.assertTrue(r.valid)
        self.assertTrue(r.offline)
        t[0] += 8 * 86400
        self.assertEqual(off.check().reason, "offline")

    def test_tampered_store_rejected_offline(self):
        lic = self.lic()
        lic.activate(KEY)
        lic.check()
        f = Path(self.dir) / "license.json"
        data = json.loads(f.read_text())
        data["signed"]["payload"] = data["signed"]["payload"].replace('"pro"', '"elite"')
        f.write_text(json.dumps(data))
        off = License(product_id=PID, base_url="http://127.0.0.1:1", store_dir=self.dir, timeout=1)
        self.assertFalse(off.check().valid)

    def test_without_ed25519_online_ok_but_no_offline_grace(self):
        with mock.patch("monemee.license.ed25519_available", return_value=False):
            lic = self.lic()
            self.assertTrue(lic.activate(KEY).valid)
            r = lic.check()
            self.assertEqual((r.valid, r.reason), (True, None))
            self.assertIsNone(json.loads((Path(self.dir) / "license.json").read_text())["signed"])
            off = License(product_id=PID, base_url="http://127.0.0.1:1", store_dir=self.dir, timeout=1)
            self.assertEqual(off.check().reason, "offline")

    def test_wrong_signature_online_rejected(self):
        lic = self.lic()
        lic.activate(KEY)
        Fake.evil = True
        r = lic.check()
        self.assertEqual((r.valid, r.reason), (False, "invalid_signature"))

    def test_revoked_forgets_key(self):
        lic = self.lic()
        lic.activate(KEY)
        Fake.valid, Fake.reason = False, "revoked"
        r = lic.check()
        self.assertEqual((r.valid, r.reason), (False, "revoked"))
        self.assertIsNone(lic.stored_key)
        self.assertEqual(lic.check().reason, "not_activated")

    def test_bad_format_and_deactivate(self):
        lic = self.lic()
        with self.assertRaises(MonemeeError):
            lic.activate("quatsch")
        self.assertEqual(Fake.calls, [])
        lic.activate(KEY)
        self.assertTrue(lic.deactivate())
        self.assertIsNone(lic.stored_key)


class AppTests(Base):
    def app(self, **kw):
        return App(app_secret=SECRET, base_url=self.base, **kw)

    def test_config_error(self):
        with self.assertRaises(MonemeeError):
            App(app_secret="falsch")

    def test_access_cache_unlock(self):
        app = self.app()
        self.assertFalse(app.has_access("u1"))
        self.assertFalse(app.has_access("u1"))
        self.assertEqual(sum(1 for c in Fake.calls if c[0].endswith("/access")), 1)
        self.assertEqual(Fake.calls[0][2], "Bearer " + SECRET)
        r = app.unlock("u1", claim="mmc_x")
        self.assertTrue(r.access)
        self.assertTrue(app.has_access("u1"))

    def test_buy_and_test_urls(self):
        app = self.app()
        self.assertEqual(app.buy_url("u 1".replace(" ", "_")), self.base + "/buy/7?ref=u_1")
        self.assertEqual(app.test_buy_url("u1", "http://localhost:8000/pro"), "http://localhost:8000/pro?monemee_claim=mmc_t")
        with self.assertRaises(MonemeeError):
            app.has_access("mit leerzeichen")

    def test_webhook(self):
        app = self.app(webhook_secret="whsec_x")
        app._cache["u1"] = (None, time.time() + 100)
        body = json.dumps({"event": "license.revoked", "data": {"external_ref": "u1"}})
        t = int(time.time())
        sig = "t=%d,v1=%s" % (t, hmac.new(b"whsec_x", ("%d.%s" % (t, body)).encode(), hashlib.sha256).hexdigest())
        self.assertEqual(app.handle_webhook(body, sig)["event"], "license.revoked")
        self.assertNotIn("u1", app._cache)
        with self.assertRaises(ValueError):
            verify_webhook(body, sig.replace("v1=", "v1=0"), "whsec_x")
        with self.assertRaises(ValueError):
            verify_webhook(body, sig, "whsec_x", now=t + 1000)


class SharedVectorTests(unittest.TestCase):
    """Gemeinsame Testvektoren (test-vectors/license-signatures.json) wie in JavaScript und Swift."""

    def test_shared_vectors(self):
        from monemee.license import verify_signed
        vectors = json.loads((Path(__file__).resolve().parents[3] / "test-vectors" / "license-signatures.json").read_text("utf-8"))
        for case in vectors["cases"]:
            p = verify_signed(case["signed"], [vectors["public_key"]])
            self.assertEqual(p is not None, case["expect"] == "valid", case["name"])
            if p:
                self.assertEqual(p["product_id"], vectors["product_id"])


if __name__ == "__main__":
    unittest.main()
