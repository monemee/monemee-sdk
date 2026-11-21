/**
 * @monemee/client – Lizenzschlüssel für Download-Software.
 * Electron, Tauri, Browser-Erweiterungen, Node-CLIs. Keine Abhängigkeiten.
 *
 *   const license = createLicense({ productId: 123 });
 *   await license.activate('MM-XXXX-XXXX-XXXX-XXXX');   // einmal
 *   const { valid } = await license.check();            // bei jedem Start, offline bis graceDays
 *
 * Offline: Monemee signiert jede Antwort (Ed25519). Die letzte gültige Antwort
 * wird gespeichert und gilt ohne Netz bis zu `graceDays` Tage – Fälschen geht
 * nicht, weil nur Monemee den privaten Schlüssel hat.
 */

const KEY_REGEX = /^MM(-[A-Z0-9]{4}){4}$/;
const STORE_VERSION = 1;

// Öffentliche Schlüssel von monemee.com (zusätzlich unter /.well-known/monemee-license-keys.json).
// Wird bei Veröffentlichung mit dem Produktiv-Schlüssel befüllt; fehlt er, holt das
// Paket die Schlüssel beim ersten Online-Check und merkt sie sich.
export const BUNDLED_PUBLIC_KEYS = [];

export class LicenseError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'LicenseError';
    this.code = code;
  }
}

function normalizeKey(key) {
  return String(key || '').trim().toUpperCase().replace(/\s+/g, '');
}

const textBytes = (s) => new TextEncoder().encode(s);

function b64urlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function sha256Hex(text) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', textBytes(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Prüft signed.signature über den exakten String signed.payload. */
export async function verifySigned(signed, publicKeys) {
  if (!signed || typeof signed.payload !== 'string' || typeof signed.signature !== 'string') return null;
  const jwk = (publicKeys || []).find((k) => k.kid === signed.kid) || null;
  if (!jwk) return null;
  try {
    const key = await globalThis.crypto.subtle.importKey('jwk', { kty: 'OKP', crv: 'Ed25519', x: jwk.x }, { name: 'Ed25519' }, false, ['verify']);
    const ok = await globalThis.crypto.subtle.verify({ name: 'Ed25519' }, key, b64urlToBytes(signed.signature), textBytes(signed.payload));
    return ok ? JSON.parse(signed.payload) : null;
  } catch (_) {
    return null; // Ed25519 nicht unterstützt oder kaputte Daten → nicht vertrauen
  }
}

/** Speicher: localStorage im Browser/Electron, Datei in Node. */
function defaultStorage(appName) {
  const ls = (() => { try { return globalThis.localStorage || null; } catch (_) { return null; } })();
  if (ls) {
    return {
      get: async (k) => ls.getItem(`${appName}:${k}`),
      set: async (k, v) => ls.setItem(`${appName}:${k}`, v),
      remove: async (k) => ls.removeItem(`${appName}:${k}`)
    };
  }
  if (globalThis.process?.versions?.node) {
    let filePromise = null;
    const file = async () => {
      if (!filePromise) {
        filePromise = Promise.all([import('node:fs/promises'), import('node:path'), import('node:os')]).then(([fs, path, os]) => {
          const dir = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), appName);
          return { fs, dir, path: path.join(dir, 'license.json') };
        });
      }
      return filePromise;
    };
    const readAll = async () => {
      const f = await file();
      try { return JSON.parse(await f.fs.readFile(f.path, 'utf8')); } catch (_) { return {}; }
    };
    const writeAll = async (data) => {
      const f = await file();
      await f.fs.mkdir(f.dir, { recursive: true, mode: 0o700 });
      await f.fs.writeFile(f.path, JSON.stringify(data), { mode: 0o600 });
    };
    return {
      get: async (k) => (await readAll())[k] ?? null,
      set: async (k, v) => { const all = await readAll(); all[k] = v; await writeAll(all); },
      remove: async (k) => { const all = await readAll(); delete all[k]; await writeAll(all); }
    };
  }
  const mem = new Map();
  return { get: async (k) => mem.get(k) ?? null, set: async (k, v) => { mem.set(k, v); }, remove: async (k) => { mem.delete(k); } };
}

/**
 * @param {object} options
 * @param {number} options.productId
 * @param {string} [options.baseUrl='https://monemee.com']
 * @param {number} [options.graceDays=7]  So lange gilt die letzte Prüfung ohne Netz
 * @param {string} [options.appName]      Speicher-Name (Standard monemee-<productId>)
 * @param {{get,set,remove}} [options.storage]
 * @param {string} [options.deviceId]     Standard: zufällige ID pro Installation
 * @param {string} [options.deviceName]
 * @param {Array<{kid:string,x:string}>} [options.publicKeys]
 * @param {typeof fetch} [options.fetch]
 * @param {() => number} [options.now]
 */
export function createLicense(options = {}) {
  const productId = Number(options.productId);
  if (!Number.isInteger(productId) || productId <= 0) throw new LicenseError('productId fehlt', 'CONFIG');
  if (!globalThis.crypto?.subtle) throw new LicenseError('WebCrypto fehlt (Node 18+ oder moderner Browser nötig)', 'CONFIG');

  const baseUrl = String(options.baseUrl || 'https://monemee.com').replace(/\/+$/, '');
  const graceMs = (options.graceDays ?? 7) * 86400000;
  const storage = options.storage || defaultStorage(options.appName || `monemee-${productId}`);
  const doFetch = options.fetch || globalThis.fetch;
  const now = options.now || (() => Date.now());
  let keys = [...(options.publicKeys || []), ...BUNDLED_PUBLIC_KEYS];

  async function load() {
    const raw = await storage.get('state');
    try {
      const s = raw ? JSON.parse(raw) : null;
      return s && s.v === STORE_VERSION ? s : null;
    } catch (_) {
      return null;
    }
  }
  const save = (s) => storage.set('state', JSON.stringify({ ...s, v: STORE_VERSION }));

  async function deviceId() {
    if (options.deviceId) return String(options.deviceId).slice(0, 128);
    let id = await storage.get('device');
    if (!id) {
      id = `d_${globalThis.crypto.randomUUID().replace(/-/g, '')}`;
      await storage.set('device', id);
    }
    return id;
  }

  async function ensureKeys() {
    if (keys.length) return;
    const cached = await storage.get('keys');
    if (cached) {
      try { keys = JSON.parse(cached); return; } catch (_) { /* neu holen */ }
    }
    const res = await doFetch(`${baseUrl}/.well-known/monemee-license-keys.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    keys = Array.isArray(json.keys) ? json.keys : [];
    if (keys.length) await storage.set('keys', JSON.stringify(keys));
  }

  async function post(path, body) {
    const res = await doFetch(`${baseUrl}/api/v1/licenses/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) throw new LicenseError((json && json.message) || `HTTP ${res.status}`, res.status === 429 ? 'RATE_LIMITED' : 'SERVER');
    return json.data;
  }

  /** Prüft eine signierte Antwort gegen Schlüssel, Produkt, Gerät und Zeit. */
  async function trusted(signed, key, device, { maxAgeMs }) {
    try { await ensureKeys(); } catch (_) { /* offline: nur gebündelte/gemerkte Schlüssel */ }
    const p = await verifySigned(signed, keys);
    if (!p) return null;
    if (p.product_id !== productId || p.key_sha256 !== (await sha256Hex(key))) return null;
    if (p.device_id && p.device_id !== device) return null;
    const issued = Date.parse(p.issued_at);
    if (!Number.isFinite(issued) || issued > now() + 300000 || now() - issued > maxAgeMs) return null;
    if (p.expires_at && Date.parse(p.expires_at) < now()) return { ...p, valid: false, reason: 'expired' };
    return p;
  }

  function toResult(data, extra = {}) {
    return {
      valid: Boolean(data.valid),
      reason: data.valid ? null : (data.reason || null),
      plan: data.plan || null,
      expiresAt: data.expires_at || null,
      test: Boolean(data.test),
      ...extra
    };
  }

  /** Schlüssel einmal aktivieren (bindet ihn an dieses Gerät). */
  async function activate(rawKey, { deviceName } = {}) {
    const key = normalizeKey(rawKey);
    if (!KEY_REGEX.test(key)) throw new LicenseError('Schlüssel im Format MM-XXXX-XXXX-XXXX-XXXX eingeben', 'INVALID_KEY');
    const device = await deviceId();
    const data = await post('activate', {
      key,
      product_id: productId,
      device_id: device,
      device_name: deviceName || options.deviceName || undefined
    });
    if (data.valid) await save({ key, signed: data.signed || null, checkedAt: now() });
    return toResult(data, { activations: data.activations || null });
  }

  /**
   * Gilt die Lizenz? Fragt Monemee; ohne Netz zählt die letzte signierte Antwort
   * (bis graceDays). { valid, reason, plan, expiresAt, offline }
   */
  async function check() {
    const state = await load();
    if (!state || !state.key) return toResult({ valid: false, reason: 'not_activated' });
    const device = await deviceId();

    let data;
    try {
      data = await post('validate', { key: state.key, product_id: productId, device_id: device });
    } catch (err) {
      if (err instanceof LicenseError && err.code !== 'SERVER' && err.code !== 'RATE_LIMITED') throw err;
      // Netzfehler / Server down → offline prüfen
      const p = state.signed ? await trusted(state.signed, state.key, device, { maxAgeMs: graceMs }) : null;
      if (!p) return toResult({ valid: false, reason: 'offline' }, { offline: true });
      return toResult(p, { offline: true });
    }

    // Online-Antwort: wenn signiert, Signatur prüfen (schützt vor manipulierten Proxys)
    if (data.signed) {
      const p = await trusted(data.signed, state.key, device, { maxAgeMs: 600000 });
      if (p && p.valid === Boolean(data.valid)) await save({ ...state, signed: data.signed, checkedAt: now() });
      else if (keys.length) return toResult({ valid: false, reason: 'invalid_signature' });
    } else {
      await save({ ...state, signed: state.signed || null, checkedAt: now() });
    }
    if (!data.valid && (data.reason === 'revoked' || data.reason === 'not_found' || data.reason === 'product_mismatch')) {
      await storage.remove('state');
    }
    return toResult(data, { activations: data.activations || null });
  }

  /** Gerät freigeben (z. B. vor Wechsel auf einen neuen Rechner). */
  async function deactivate() {
    const state = await load();
    if (!state) return { deactivated: false };
    const device = await deviceId();
    let result = { deactivated: false };
    try {
      result = await post('deactivate', { key: state.key, product_id: productId, device_id: device });
    } finally {
      await storage.remove('state');
    }
    return { deactivated: Boolean(result.deactivated) };
  }

  /** Gespeicherter Schlüssel (oder null). */
  async function storedKey() {
    const state = await load();
    return state ? state.key : null;
  }

  return { activate, check, deactivate, storedKey, deviceId };
}
