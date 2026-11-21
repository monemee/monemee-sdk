'use strict';

/**
 * Schlanker HTTP-Client für die Monemee-App-API (/api/v1/apps/*).
 * Nutzt das eingebaute fetch (Node ≥ 18). Keine Abhängigkeiten.
 */

const DEFAULT_TIMEOUT_MS = 8000;

class MonemeeError extends Error {
  constructor(message, { status = null, code = null } = {}) {
    super(message);
    this.name = 'MonemeeError';
    this.status = status;
    this.code = code;
  }
}

function createApi({ baseUrl, appSecret, fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS, userAgent }) {
  if (typeof fetchImpl !== 'function') {
    throw new MonemeeError('fetch ist nicht verfügbar – Node 18 oder neuer nötig (oder fetch übergeben).');
  }

  async function request(method, path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(`${baseUrl}/api/v1/apps${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${appSecret}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': userAgent
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
    } catch (err) {
      const reason = err && err.name === 'AbortError' ? 'Zeitüberschreitung' : (err && err.message) || 'Netzwerkfehler';
      throw new MonemeeError(`Monemee nicht erreichbar (${reason})`, { code: 'NETWORK' });
    } finally {
      clearTimeout(timer);
    }

    let json = null;
    try {
      json = await res.json();
    } catch (_) {
      // leere oder kaputte Antwort – unten behandelt
    }
    if (!res.ok || !json || json.success === false) {
      const message = (json && json.message) || `Monemee antwortete mit HTTP ${res.status}`;
      throw new MonemeeError(message, { status: res.status, code: json && json.code });
    }
    return json.data;
  }

  return {
    me: () => request('GET', '/me'),
    access: (ref) => request('POST', '/access', { ref }),
    claim: ({ claim, key, ref }) => request('POST', '/claim', { claim, key, ref }),
    testClaim: ({ ref, returnUrl }) => request('POST', '/test-claim', { ref, return_url: returnUrl })
  };
}

module.exports = { createApi, MonemeeError };
