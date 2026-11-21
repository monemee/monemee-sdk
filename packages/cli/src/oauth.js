import crypto from 'node:crypto';
import http from 'node:http';
import { readCredentials, writeCredentials } from './config.js';

/**
 * Login per Browser: OAuth 2.1 mit PKCE und Loopback-Redirect.
 * 1. Client per Dynamic Client Registration anlegen (Redirect http://127.0.0.1:<port>/callback)
 * 2. Browser öffnet die Monemee-Freigabe (Scope monemee:cli)
 * 3. Code am lokalen Server abholen, gegen Tokens tauschen, speichern (0600)
 */

const SCOPE = 'monemee:cli';
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

const b64url = (buf) => buf.toString('base64url');

async function postForm(url, form, basicAuth) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      ...(basicAuth ? { Authorization: `Basic ${Buffer.from(basicAuth).toString('base64')}` } : {})
    },
    body: new URLSearchParams(form).toString()
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description || json.error || `HTTP ${res.status}`);
  return json;
}

function listenOnLoopback() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function waitForCode(server, expectedState) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Login abgebrochen (5 Minuten ohne Freigabe).')), LOGIN_TIMEOUT_MS);
    server.on('request', (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const page = (title, text) => `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#1A1A19">
<h1 style="color:#2340D0">${title}</h1><p>${text}</p></body>`;
      const error = url.searchParams.get('error');
      if (error || url.searchParams.get('state') !== expectedState || !url.searchParams.get('code')) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          .end(page('Login fehlgeschlagen', 'Bitte im Terminal erneut <code>npx monemee login</code> ausführen.'));
        clearTimeout(timer);
        reject(new Error(error === 'access_denied' ? 'Freigabe abgelehnt.' : 'Login fehlgeschlagen (ungültige Antwort).'));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        .end(page('Verbunden ✓', 'Du kannst dieses Fenster schließen und zum Terminal zurückkehren.'));
      clearTimeout(timer);
      resolve(url.searchParams.get('code'));
    });
  });
}

/**
 * @param {string} base  z. B. https://monemee.com
 * @param {(url: string) => void} openBrowser
 * @param {(msg: string) => void} log
 */
export async function login(base, { openBrowser, log }) {
  const server = await listenOnLoopback();
  try {
    const redirectUri = `http://127.0.0.1:${server.address().port}/callback`;

    // 1. Client registrieren (eigener Client pro Login, weil der Port wechselt)
    const regRes = await fetch(`${base}/api/oauth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_name: 'Monemee CLI',
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_method: 'client_secret_basic'
      })
    });
    const reg = await regRes.json().catch(() => ({}));
    if (!regRes.ok) throw new Error(`Registrierung fehlgeschlagen: ${reg.error_description || reg.error || regRes.status}`);

    // 2. PKCE + Browser
    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const state = b64url(crypto.randomBytes(16));
    const auth = new URL(`${base}/oauth/authorize`);
    auth.search = new URLSearchParams({
      response_type: 'code',
      client_id: reg.client_id,
      redirect_uri: redirectUri,
      scope: SCOPE,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    }).toString();

    log(`Browser öffnet sich zur Freigabe. Falls nicht, diesen Link öffnen:\n  ${auth}`);
    openBrowser(auth.toString());
    const code = await waitForCode(server, state);

    // 3. Tokens holen
    const tokens = await postForm(`${base}/api/oauth/token`, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier
    }, `${reg.client_id}:${reg.client_secret}`);

    const creds = {
      client_id: reg.client_id,
      client_secret: reg.client_secret,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + (tokens.expires_in || 3600) * 1000
    };
    writeCredentials(base, creds);
    return creds;
  } finally {
    server.close();
  }
}

/** Gültiges Access-Token (erneuert es bei Bedarf). */
export async function accessToken(base) {
  const creds = readCredentials(base);
  if (!creds) return null;
  if (creds.expires_at - 60_000 > Date.now()) return creds.access_token;
  try {
    const tokens = await postForm(`${base}/api/oauth/token`, {
      grant_type: 'refresh_token',
      refresh_token: creds.refresh_token
    }, `${creds.client_id}:${creds.client_secret}`);
    const next = {
      ...creds,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || creds.refresh_token,
      expires_at: Date.now() + (tokens.expires_in || 3600) * 1000
    };
    writeCredentials(base, next);
    return next.access_token;
  } catch (_) {
    writeCredentials(base, null); // Refresh ungültig → neu einloggen
    return null;
  }
}
