import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

process.env.MONEMEE_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'monemee-cfg-'));
const { login, accessToken } = await import('../src/oauth.js');
const { readCredentials } = await import('../src/config.js');

/** Nachgebauter Monemee-OAuth-Server. */
async function fakeOauth({ deny = false } = {}) {
  const state = { challenge: null, redirect: null, refreshed: 0 };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    let body = '';
    for await (const c of req) body += c;
    const json = (s, o) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (url.pathname === '/api/oauth/register') {
      const b = JSON.parse(body);
      state.redirect = b.redirect_uris[0];
      assert.match(state.redirect, /^http:\/\/127\.0\.0\.1:\d+\/callback$/);
      return json(201, { client_id: 'cid', client_secret: 'csec' });
    }
    if (url.pathname === '/oauth/authorize') {
      assert.equal(url.searchParams.get('scope'), 'monemee:cli');
      assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
      state.challenge = url.searchParams.get('code_challenge');
      const back = new URL(url.searchParams.get('redirect_uri'));
      if (deny) back.searchParams.set('error', 'access_denied');
      else back.searchParams.set('code', 'code123');
      back.searchParams.set('state', url.searchParams.get('state'));
      res.writeHead(302, { Location: back.toString() });
      return res.end();
    }
    if (url.pathname === '/api/oauth/token') {
      assert.equal(req.headers.authorization, `Basic ${Buffer.from('cid:csec').toString('base64')}`);
      const p = new URLSearchParams(body);
      if (p.get('grant_type') === 'authorization_code') {
        const ok = crypto.createHash('sha256').update(p.get('code_verifier')).digest('base64url') === state.challenge;
        if (!ok || p.get('code') !== 'code123' || p.get('redirect_uri') !== state.redirect) return json(400, { error: 'invalid_grant' });
        return json(200, { access_token: 'mcp_a1', refresh_token: 'r1', expires_in: 3600 });
      }
      if (p.get('grant_type') === 'refresh_token') {
        state.refreshed += 1;
        if (p.get('refresh_token') !== 'r1') return json(400, { error: 'invalid_grant' });
        return json(200, { access_token: 'mcp_a2', refresh_token: 'r2', expires_in: 3600 });
      }
    }
    json(404, {});
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${server.address().port}`, state, close: () => new Promise((r) => server.close(r)) };
}

// "Browser": folgt der Freigabe-Weiterleitung bis zum Loopback-Callback
const browser = (url) => { fetch(url).catch(() => {}); };

test('Login: PKCE + State, Tokens werden mit 0600 gespeichert', async () => {
  const s = await fakeOauth();
  try {
    const creds = await login(s.base, { openBrowser: browser, log: () => {} });
    assert.equal(creds.access_token, 'mcp_a1');
    assert.equal(readCredentials(s.base).refresh_token, 'r1');
    const mode = fs.statSync(path.join(process.env.MONEMEE_CONFIG_DIR, 'credentials.json')).mode & 0o777;
    assert.equal(mode, 0o600);
    assert.equal(await accessToken(s.base), 'mcp_a1');
  } finally {
    await s.close();
  }
});

test('abgelaufenes Token wird per Refresh erneuert, kaputter Refresh löscht den Login', async () => {
  const s = await fakeOauth();
  try {
    await login(s.base, { openBrowser: browser, log: () => {} });
    const file = path.join(process.env.MONEMEE_CONFIG_DIR, 'credentials.json');
    const all = JSON.parse(fs.readFileSync(file, 'utf8'));
    all[s.base].expires_at = Date.now() - 1000;
    fs.writeFileSync(file, JSON.stringify(all));
    assert.equal(await accessToken(s.base), 'mcp_a2');
    assert.equal(s.state.refreshed, 1);

    all[s.base] = { ...all[s.base], refresh_token: 'kaputt', expires_at: 0 };
    fs.writeFileSync(file, JSON.stringify(all));
    assert.equal(await accessToken(s.base), null);
    assert.equal(readCredentials(s.base), null);
  } finally {
    await s.close();
  }
});

test('abgelehnte Freigabe → verständlicher Fehler', async () => {
  const s = await fakeOauth({ deny: true });
  try {
    await assert.rejects(login(s.base, { openBrowser: browser, log: () => {} }), /Freigabe abgelehnt/);
  } finally {
    await s.close();
  }
});
