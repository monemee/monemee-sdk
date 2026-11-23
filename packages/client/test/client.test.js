import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createLicense, verifySigned, ed25519Supported, storageDir } from '../src/index.js';

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const JWK = { kid: 'test-1', x: publicKey.export({ format: 'jwk' }).x };
const KEY = 'MM-A7K2-9FQ3-XT8M-2B4C';
const PID = 42;

function signedFor(fields, priv = privateKey) {
  const payload = JSON.stringify(Object.fromEntries(Object.entries({
    v: 1, key_sha256: crypto.createHash('sha256').update(KEY).digest('hex'), product_id: PID,
    device_id: null, valid: true, reason: null, plan: 'pro', expires_at: null, test: false,
    issued_at: new Date().toISOString(), ...fields
  }).sort()));
  return { payload, signature: crypto.sign(null, Buffer.from(payload), priv).toString('base64url'), kid: 'test-1', alg: 'EdDSA' };
}

function memory() {
  const m = new Map();
  return { get: async (k) => m.get(k) ?? null, set: async (k, v) => { m.set(k, v); }, remove: async (k) => { m.delete(k); }, m };
}

/** Fake-Monemee mit Schalter für „offline“. */
function server({ valid = true, reason = null } = {}) {
  const s = { offline: false, calls: [], valid, reason, sign: true };
  s.fetch = async (url, init) => {
    if (s.offline) throw new TypeError('fetch failed');
    const path = new URL(url).pathname;
    const body = init?.body ? JSON.parse(init.body) : null;
    s.calls.push({ path, body });
    if (path.endsWith('monemee-license-keys.json')) return Response.json({ keys: [JWK] });
    const data = { valid: s.valid, reason: s.valid ? null : s.reason, product_id: PID, plan: 'pro', expires_at: null };
    if (s.sign) data.signed = signedFor({ device_id: body.device_id, valid: s.valid, reason: data.reason });
    return Response.json({ success: true, data });
  };
  return s;
}

test('activate + check online, Gerät-ID bleibt gleich, Schlüssel wird normalisiert', async () => {
  const s = server();
  const storage = memory();
  const lic = createLicense({ productId: PID, storage, fetch: s.fetch });
  const a = await lic.activate(' mm-a7k2-9fq3-xt8m-2b4c ');
  assert.equal(a.valid, true);
  assert.equal(s.calls[0].body.key, KEY);
  const device = s.calls[0].body.device_id;
  assert.match(device, /^d_[0-9a-f]{32}$/);
  const c = await lic.check();
  assert.deepEqual({ valid: c.valid, plan: c.plan }, { valid: true, plan: 'pro' });
  assert.equal(s.calls.find((x) => x.path.endsWith('/validate')).body.device_id, device);
  assert.equal(await lic.storedKey(), KEY);
});

test('offline: letzte signierte Antwort gilt bis graceDays, danach nicht mehr', async () => {
  const s = server();
  let t = Date.now();
  const lic = createLicense({ productId: PID, storage: memory(), fetch: s.fetch, now: () => t, graceDays: 7 });
  await lic.activate(KEY);
  await lic.check();
  s.offline = true;
  const off = await lic.check();
  assert.deepEqual({ valid: off.valid, offline: off.offline }, { valid: true, offline: true });
  t += 8 * 86400000;
  const late = await lic.check();
  assert.deepEqual({ valid: late.valid, reason: late.reason }, { valid: false, reason: 'offline' });
});

test('offline: gefälschte oder fremde Antwort wird nicht akzeptiert', async () => {
  const s = server();
  const storage = memory();
  const lic = createLicense({ productId: PID, storage, fetch: s.fetch });
  await lic.activate(KEY);
  await lic.check();
  const state = JSON.parse(storage.m.get('state'));

  // Payload manipuliert (anderer Plan), Signatur bleibt
  storage.m.set('state', JSON.stringify({ ...state, signed: { ...state.signed, payload: state.signed.payload.replace('"pro"', '"elite"') } }));
  s.offline = true;
  assert.equal((await lic.check()).valid, false);

  // Mit fremdem Schlüssel signiert
  const { privateKey: evil } = crypto.generateKeyPairSync('ed25519');
  storage.m.set('state', JSON.stringify({ ...state, signed: signedFor({ device_id: JSON.parse(state.signed.payload).device_id }, evil) }));
  assert.equal((await lic.check()).valid, false);
});

test('Erstattung (revoked) → ungültig und gespeicherter Schlüssel wird gelöscht', async () => {
  const s = server();
  const lic = createLicense({ productId: PID, storage: memory(), fetch: s.fetch });
  await lic.activate(KEY);
  s.valid = false;
  s.reason = 'revoked';
  const r = await lic.check();
  assert.deepEqual({ valid: r.valid, reason: r.reason }, { valid: false, reason: 'revoked' });
  assert.equal(await lic.storedKey(), null);
  assert.equal((await lic.check()).reason, 'not_activated');
});

test('ohne Aktivierung: not_activated; falsches Format: Fehler ohne Netz', async () => {
  const s = server();
  const lic = createLicense({ productId: PID, storage: memory(), fetch: s.fetch });
  assert.equal((await lic.check()).reason, 'not_activated');
  await assert.rejects(lic.activate('quatsch'), /Format/);
  assert.equal(s.calls.length, 0);
});

test('Server ohne Signatur: online ok, offline kein Freifahrtschein', async () => {
  const s = server();
  s.sign = false;
  const lic = createLicense({ productId: PID, storage: memory(), fetch: s.fetch });
  await lic.activate(KEY);
  assert.equal((await lic.check()).valid, true);
  s.offline = true;
  assert.equal((await lic.check()).valid, false);
});

test('deactivate gibt das Gerät frei und vergisst den Schlüssel', async () => {
  const s = server();
  const lic = createLicense({ productId: PID, storage: memory(), fetch: async (u, i) => (u.endsWith('/deactivate') ? Response.json({ success: true, data: { deactivated: true } }) : s.fetch(u, i)) });
  await lic.activate(KEY);
  assert.deepEqual(await lic.deactivate(), { deactivated: true });
  assert.equal(await lic.storedKey(), null);
});

test('verifySigned: richtige Signatur → Payload, unbekannte kid → null', async () => {
  const signed = signedFor({});
  assert.equal((await verifySigned(signed, [JWK])).plan, 'pro');
  assert.equal(await verifySigned({ ...signed, kid: 'anders' }, [JWK]), null);
});

/** Simuliert eine Laufzeit ohne Ed25519 in WebCrypto (ältere Browser/Webviews). */
async function withoutEd25519(fn) {
  const subtle = globalThis.crypto.subtle;
  const orig = subtle.importKey;
  subtle.importKey = async function (format, keyData, algorithm, ...rest) {
    if ((algorithm?.name || algorithm) === 'Ed25519') throw new DOMException('Unrecognized algorithm name', 'NotSupportedError');
    return orig.call(this, format, keyData, algorithm, ...rest);
  };
  try { return await fn(); } finally { delete subtle.importKey; }
}

test('ohne Ed25519: online gilt die Antwort (kein invalid_signature), aber kein Offline-Nachweis', async () => {
  await withoutEd25519(async () => {
    assert.equal(await ed25519Supported(), false);
    const s = server();
    const storage = memory();
    const lic = createLicense({ productId: PID, storage, fetch: s.fetch, publicKeys: [JWK] });
    assert.equal((await lic.activate(KEY)).valid, true);
    const c = await lic.check();
    assert.deepEqual({ valid: c.valid, reason: c.reason }, { valid: true, reason: null });
    assert.equal(JSON.parse(storage.m.get('state')).signed, null);
    s.offline = true;
    const off = await lic.check();
    assert.deepEqual({ valid: off.valid, reason: off.reason }, { valid: false, reason: 'offline' });
  });
  assert.equal(await ed25519Supported(), true);
});

test('mit Ed25519: falsch signierte Online-Antwort → invalid_signature, nichts gespeichert', async () => {
  const s = server();
  const storage = memory();
  const lic = createLicense({ productId: PID, storage, fetch: s.fetch, publicKeys: [JWK] });
  await lic.activate(KEY);
  const before = storage.m.get('state');
  const { privateKey: evil } = crypto.generateKeyPairSync('ed25519');
  const evilFetch = async (url, init) => {
    const res = await s.fetch(url, init);
    if (!url.endsWith('/validate')) return res;
    const json = await res.json();
    json.data.signed = signedFor({ device_id: JSON.parse(init.body).device_id }, evil);
    return Response.json(json);
  };
  const lic2 = createLicense({ productId: PID, storage, fetch: evilFetch, publicKeys: [JWK] });
  const r = await lic2.check();
  assert.deepEqual({ valid: r.valid, reason: r.reason }, { valid: false, reason: 'invalid_signature' });
  assert.equal(storage.m.get('state'), before);
  assert.ok(lic);
});

test('storageDir: Windows nutzt %APPDATA%, sonst XDG_CONFIG_HOME bzw. ~/.config', async () => {
  const path = await import('node:path');
  assert.equal(storageDir('monemee-42', { path: path.win32, home: 'C:\\Users\\a', platform: 'win32', env: { APPDATA: 'C:\\Users\\a\\AppData\\Roaming' } }), 'C:\\Users\\a\\AppData\\Roaming\\monemee-42');
  assert.equal(storageDir('monemee-42', { path: path.win32, home: 'C:\\Users\\a', platform: 'win32', env: {} }), 'C:\\Users\\a\\.config\\monemee-42');
  assert.equal(storageDir('monemee-42', { path: path.posix, home: '/home/a', platform: 'linux', env: { APPDATA: '/x' } }), '/home/a/.config/monemee-42');
  assert.equal(storageDir('monemee-42', { path: path.posix, home: '/home/a', platform: 'darwin', env: { XDG_CONFIG_HOME: '/cfg' } }), '/cfg/monemee-42');
});

test('gemeinsame Testvektoren (test-vectors/license-signatures.json) wie in Python und Swift', async () => {
  const fs = await import('node:fs');
  const vectors = JSON.parse(fs.readFileSync(new URL('../../../test-vectors/license-signatures.json', import.meta.url), 'utf8'));
  for (const c of vectors.cases) {
    const p = await verifySigned(c.signed, [vectors.public_key]);
    assert.equal(p !== null, c.expect === 'valid', c.name);
    if (p) assert.equal(p.product_id, vectors.product_id);
  }
});
