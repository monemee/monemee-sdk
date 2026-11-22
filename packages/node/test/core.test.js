'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const createMonemee = require('..');

const SECRET = `mmapp_test_${'a'.repeat(32)}`;
const LIVE = `mmapp_live_${'b'.repeat(32)}`;
const WHSEC = 'whsec_test_123';

/** Fake-Monemee: zählt Aufrufe, antwortet je nach Pfad. */
function fakeFetch(handlers = {}) {
  const calls = [];
  const fn = async (url, init) => {
    const path = new URL(url).pathname.replace('/api/v1/apps', '');
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path, body, auth: init.headers.Authorization });
    const h = handlers[path];
    const data = typeof h === 'function' ? h(body) : h;
    if (data instanceof Error) return new Response(JSON.stringify({ success: false, message: data.message }), { status: 500 });
    return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  fn.calls = calls;
  return fn;
}

function sign(body, secret = WHSEC, t = Math.floor(Date.now() / 1000)) {
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

/** Startet einen echten Node-HTTP-Server mit monemee.routes(). */
async function serve(monemee, { user = 'user_1', extra } = {}) {
  const routes = monemee.routes();
  const server = http.createServer((req, res) => {
    req.user = user ? { id: user } : null;
    routes(req, res, () => {
      if (extra) return extra(req, res);
      res.statusCode = 404;
      res.end('next');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

test('Konfiguration: fehlendes oder kaputtes Secret → kein Fehler beim Erzeugen, klare Meldung beim Gebrauch, 503', async () => {
  const saved = process.env.MONEMEE_APP_SECRET;
  delete process.env.MONEMEE_APP_SECRET;
  try {
    const fetch = fakeFetch({ '/access': { access: true } });
    const m = createMonemee({ fetch, getRef: () => 'u1' }); // z. B. während `next build` ohne .env
    assert.equal(m.mode, 'live');
    await assert.rejects(m.hasAccess('u1'), /MONEMEE_APP_SECRET fehlt/);
    await assert.rejects(createMonemee({ appSecret: 'monemee_falsch' }).buyUrl(), /ungültig/);

    const res = await m.nextRoute().GET(new Request('https://app.example.com/monemee/access'));
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, 'monemee_not_configured');
    assert.match(body.message, /MONEMEE_APP_SECRET/);

    const { response, access } = await m.guard(new Request('https://app.example.com/api'));
    assert.equal(access, null);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'monemee_not_configured');
    assert.equal(fetch.calls.length, 0);
  } finally {
    if (saved) process.env.MONEMEE_APP_SECRET = saved;
  }
  assert.equal(createMonemee({ appSecret: SECRET }).mode, 'test');
  assert.equal(createMonemee({ appSecret: LIVE }).mode, 'live');
});

test('hasAccess: fragt Monemee mit App-Secret und speichert das Ergebnis zwischen', async () => {
  const fetch = fakeFetch({ '/access': { access: true, plan: 'pro', ref: 'u1' } });
  const m = createMonemee({ appSecret: SECRET, fetch });
  assert.equal(await m.hasAccess('u1'), true);
  assert.equal(await m.hasAccess('u1'), true);
  assert.equal(fetch.calls.length, 1);
  assert.equal(fetch.calls[0].auth, `Bearer ${SECRET}`);
  assert.deepEqual(fetch.calls[0].body, { ref: 'u1' });
  // Zahlen als ref sind erlaubt
  await m.hasAccess(42);
  assert.deepEqual(fetch.calls[1].body, { ref: '42' });
});

test('ungültiger ref → Fehler ohne Netzaufruf', async () => {
  const fetch = fakeFetch({});
  const m = createMonemee({ appSecret: SECRET, fetch });
  await assert.rejects(m.hasAccess('mit leerzeichen'), /ref muss/);
  assert.equal(fetch.calls.length, 0);
});

test('unlock leert den Cache und merkt sich den neuen Zugang', async () => {
  let granted = false;
  const fetch = fakeFetch({
    '/access': () => ({ access: granted, reason: granted ? null : 'no_license' }),
    '/claim': () => { granted = true; return { access: true, plan: 'pro' }; }
  });
  const m = createMonemee({ appSecret: SECRET, fetch });
  assert.equal(await m.hasAccess('u1'), false);
  const r = await m.unlock({ claim: 'mmc_x', ref: 'u1' });
  assert.equal(r.access, true);
  assert.equal(await m.hasAccess('u1'), true);
  assert.equal(fetch.calls.filter((c) => c.path === '/access').length, 1);
});

test('buyUrl: Produkt-ID aus Option oder /apps/me, ref als Parameter', async () => {
  const fetch = fakeFetch({ '/me': { product_id: 77 } });
  const a = createMonemee({ appSecret: SECRET, productId: 5, fetch, baseUrl: 'https://staging.monemee.com/' });
  assert.equal(await a.buyUrl('u 1'.replace(' ', '_')), 'https://staging.monemee.com/buy/5?ref=u_1');
  const b = createMonemee({ appSecret: SECRET, fetch });
  assert.equal(await b.buyUrl(), 'https://monemee.com/buy/77');
  assert.equal(await b.buyUrl(), 'https://monemee.com/buy/77');
  assert.equal(fetch.calls.filter((c) => c.path === '/me').length, 1);
});

test('Monemee nicht erreichbar → MonemeeError mit code NETWORK', async () => {
  const m = createMonemee({ appSecret: SECRET, fetch: async () => { throw new Error('ECONNREFUSED'); } });
  await assert.rejects(m.access('u1'), (err) => err.code === 'NETWORK' && /nicht erreichbar/.test(err.message));
});

test('Routen: /return löst den Token ein und leitet weiter', async () => {
  const fetch = fakeFetch({ '/claim': (b) => (b.claim === 'mmc_gut' ? { access: true } : { access: false, reason: 'claim_invalid' }) });
  const m = createMonemee({ appSecret: SECRET, fetch, getRef: (req) => req.user && req.user.id, successPath: '/app?tab=pro' });
  const s = await serve(m);
  try {
    const ok = await fetch_(`${s.base}/monemee/return?monemee_claim=mmc_gut`);
    assert.equal(ok.status, 302);
    assert.equal(ok.headers.get('location'), '/app?tab=pro&monemee=unlocked');
    assert.deepEqual(fetch.calls[0].body, { claim: 'mmc_gut', ref: 'user_1' });

    const bad = await fetch_(`${s.base}/monemee/return?monemee_claim=mmc_alt`);
    assert.equal(bad.headers.get('location'), '/app?tab=pro&monemee_error=claim_invalid');
  } finally {
    await s.close();
  }
});

test('Routen: /return ohne Login → loginUrl mit Rückweg, sonst 401', async () => {
  const fetch = fakeFetch({});
  const withLogin = createMonemee({ appSecret: SECRET, fetch, getRef: () => null, loginUrl: (back) => `/login?next=${encodeURIComponent(back)}` });
  const s1 = await serve(withLogin, { user: null });
  const s2 = await serve(createMonemee({ appSecret: SECRET, fetch, getRef: () => null }), { user: null });
  try {
    const r1 = await fetch_(`${s1.base}/monemee/return?monemee_claim=mmc_1`);
    assert.equal(r1.headers.get('location'), `/login?next=${encodeURIComponent('/monemee/return?monemee_claim=mmc_1')}`);
    const r2 = await fetch_(`${s2.base}/monemee/return?monemee_claim=mmc_1`);
    assert.equal(r2.status, 401);
    assert.equal(fetch.calls.length, 0);
  } finally {
    await s1.close();
    await s2.close();
  }
});

test('Routen: /buy leitet zum Kauf-Link mit ref, /access liefert JSON', async () => {
  const fetch = fakeFetch({ '/access': { access: false, reason: 'no_license' } });
  const m = createMonemee({ appSecret: SECRET, productId: 9, fetch, getRef: (req) => req.user && req.user.id });
  const s = await serve(m);
  try {
    const buy = await fetch_(`${s.base}/monemee/buy`);
    assert.equal(buy.headers.get('location'), 'https://monemee.com/buy/9?ref=user_1');
    const acc = await fetch_(`${s.base}/monemee/access`);
    assert.deepEqual(await acc.json(), {
      access: false, reason: 'no_license', plan: null, expires_at: null, buy_url: '/monemee/buy', mode: 'test'
    });
  } finally {
    await s.close();
  }
});

test('Routen: /test-buy schickt die lokale Rücksprung-URL mit (nur Testmodus)', async () => {
  const fetch = fakeFetch({ '/test-claim': (b) => ({ redirectUrl: `${b.return_url}?monemee_claim=mmc_t` }) });
  const m = createMonemee({ appSecret: SECRET, fetch, getRef: (req) => req.user.id });
  const s = await serve(m);
  try {
    const r = await fetch_(`${s.base}/monemee/test-buy`);
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), `${s.base}/monemee/return?monemee_claim=mmc_t`);
    assert.deepEqual(fetch.calls[0].body, { ref: 'user_1', return_url: `${s.base}/monemee/return` });
  } finally {
    await s.close();
  }
  const live = await serve(createMonemee({ appSecret: LIVE, fetch, getRef: (req) => req.user.id }));
  try {
    assert.equal((await fetch_(`${live.base}/monemee/test-buy`)).status, 404);
  } finally {
    await live.close();
  }
});

test('Routen: /unlock mit Schlüssel', async () => {
  const fetch = fakeFetch({ '/claim': { access: true, plan: 'pro' } });
  const m = createMonemee({ appSecret: SECRET, fetch, getRef: (req) => req.user.id });
  const s = await serve(m);
  try {
    const r = await fetch_(`${s.base}/monemee/unlock`, { method: 'POST', body: JSON.stringify({ key: 'mm-a7k2-9fq3-xt8m-2b4c' }) });
    assert.deepEqual(await r.json(), { access: true, reason: null, plan: 'pro', expires_at: null });
    assert.deepEqual(fetch.calls[0].body, { key: 'MM-A7K2-9FQ3-XT8M-2B4C', ref: 'user_1' });
    const bad = await fetch_(`${s.base}/monemee/unlock`, { method: 'POST', body: '{"key":"quatsch"}' });
    assert.equal(bad.status, 400);
  } finally {
    await s.close();
  }
});

test('Routen: /unlock mit Rücksprung-Token, /buy-url als JSON, /test-buy?return=', async () => {
  const fetch = fakeFetch({
    '/claim': { access: true, plan: 'pro' },
    '/test-claim': (b) => ({ redirectUrl: `${b.return_url}?monemee_claim=mmc_t` })
  });
  const m = createMonemee({ appSecret: SECRET, productId: 3, fetch, getRef: (req) => req.user.id });
  const s = await serve(m);
  try {
    const claim = `mmc_${'Z'.repeat(32)}`;
    const r = await fetch_(`${s.base}/monemee/unlock`, { method: 'POST', body: JSON.stringify({ claim }) });
    assert.equal((await r.json()).access, true);
    assert.deepEqual(fetch.calls[0].body, { claim, ref: 'user_1' });

    assert.deepEqual(await (await fetch_(`${s.base}/monemee/buy-url`)).json(), { url: 'https://monemee.com/buy/3?ref=user_1' });

    const t = await fetch_(`${s.base}/monemee/test-buy?return=/pro&format=json`);
    assert.deepEqual(await t.json(), { url: `${s.base}/pro?monemee_claim=mmc_t` });
    // fremde Herkunft wird ignoriert
    const evil = await fetch_(`${s.base}/monemee/test-buy?return=//boese.example&format=json`);
    assert.deepEqual(await evil.json(), { url: `${s.base}/monemee/return?monemee_claim=mmc_t` });
  } finally {
    await s.close();
  }
});

test('Webhook: gültige Signatur leert den Cache und ruft onEvent, falsche → 400', async () => {
  const events = [];
  let granted = true;
  const fetch = fakeFetch({ '/access': () => ({ access: granted }) });
  const m = createMonemee({ appSecret: SECRET, webhookSecret: WHSEC, fetch, getRef: (req) => req.user.id, onEvent: (e) => events.push(e.event) });
  const s = await serve(m);
  try {
    assert.equal(await m.hasAccess('user_1'), true);
    granted = false; // Erstattung bei Monemee
    const body = JSON.stringify({ event: 'license.revoked', created: 1, data: { external_ref: 'user_1', reason: 'refund' } });
    const ok = await fetch_(`${s.base}/monemee/webhook`, { method: 'POST', body, headers: { 'Monemee-Signature': sign(body) } });
    assert.equal(ok.status, 200);
    assert.deepEqual(events, ['license.revoked']);
    assert.equal(await m.hasAccess('user_1'), false);

    const forged = await fetch_(`${s.base}/monemee/webhook`, { method: 'POST', body, headers: { 'Monemee-Signature': sign(body, 'falsch') } });
    assert.equal(forged.status, 400);
    const old = await fetch_(`${s.base}/monemee/webhook`, { method: 'POST', body, headers: { 'Monemee-Signature': sign(body, WHSEC, 1000) } });
    assert.equal(old.status, 400);
  } finally {
    await s.close();
  }
});

test('Webhook nach express.json(): klare Fehlermeldung statt stiller Durchlass', async () => {
  const m = createMonemee({ appSecret: SECRET, webhookSecret: WHSEC, fetch: fakeFetch({}) });
  const routes = m.routes();
  const server = http.createServer((req, res) => {
    // wie express.json(): Stream lesen, dann req.body setzen
    req.resume();
    req.on('end', () => {
      req.body = { schon: 'geparst' };
      routes(req, res, (err) => { res.statusCode = 500; res.end(err ? err.message : 'next'); });
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const r = await fetch_(`http://127.0.0.1:${server.address().port}/monemee/webhook`, { method: 'POST', body: '{}', headers: { 'Monemee-Signature': 't=1,v1=00' } });
    assert.equal(r.status, 400);
    assert.match((await r.json()).message, /monemee.webhook\(\)\) VOR express.json\(\)/);
  } finally {
    await new Promise((res) => server.close(res));
  }
});

test('webhook(): beantwortet nur POST /monemee/webhook, alles andere geht weiter', async () => {
  const m = createMonemee({ appSecret: SECRET, webhookSecret: WHSEC, fetch: fakeFetch({}), getRef: () => 'u' });
  const hook = m.webhook();
  const server = http.createServer((req, res) => hook(req, res, () => res.end('weiter')));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const body = JSON.stringify({ event: 'license.created', created: 1, data: {} });
    const ok = await fetch_(`${base}/monemee/webhook`, { method: 'POST', body, headers: { 'Monemee-Signature': sign(body) } });
    assert.equal(ok.status, 200);
    assert.equal(await (await fetch_(`${base}/monemee/access`)).text(), 'weiter');
  } finally {
    await new Promise((res) => server.close(res));
  }
});

test('fremde Pfade gehen an next() weiter', async () => {
  const m = createMonemee({ appSecret: SECRET, fetch: fakeFetch({}), getRef: () => 'u' });
  const s = await serve(m, { extra: (req, res) => res.end('app') });
  try {
    assert.equal(await (await fetch_(`${s.base}/irgendwas`)).text(), 'app');
    assert.equal(await (await fetch_(`${s.base}/monemee/gibtsnicht`)).text(), 'app');
  } finally {
    await s.close();
  }
});

test('requireAccess: 401 ohne Login, 402 mit buy_url ohne Kauf, weiter mit Zugang', async () => {
  let granted = false;
  const fetch = fakeFetch({ '/access': () => ({ access: granted, reason: granted ? null : 'no_license', plan: 'pro' }) });
  const m = createMonemee({ appSecret: SECRET, fetch, getRef: (req) => req.user && req.user.id, cacheSeconds: 0 });
  const guard = m.requireAccess();
  const server = http.createServer((req, res) => {
    req.user = req.headers['x-user'] ? { id: req.headers['x-user'] } : null;
    guard(req, res, () => res.end(`pro:${req.monemee.plan}`));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch_(base)).status, 401);
    const denied = await fetch_(base, { headers: { 'x-user': 'u1' } });
    assert.equal(denied.status, 402);
    assert.deepEqual(await denied.json(), { error: 'payment_required', reason: 'no_license', buy_url: '/monemee/buy' });
    granted = true;
    assert.equal(await (await fetch_(base, { headers: { 'x-user': 'u1' } })).text(), 'pro:pro');
  } finally {
    await new Promise((res) => server.close(res));
  }
});

test('Web-Standard: nextRoute() und guard()', async () => {
  const fetch = fakeFetch({ '/access': { access: true, plan: 'pro' }, '/claim': { access: true, plan: 'pro' } });
  const m = createMonemee({ appSecret: SECRET, fetch, getRef: async (request) => request.headers.get('x-user') });
  const { GET } = m.nextRoute();
  const res = await GET(new Request('https://app.example.com/monemee/access', { headers: { 'x-user': 'u9' } }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).access, true);
  const ret = await GET(new Request('https://app.example.com/monemee/return?monemee_claim=mmc_1', { headers: { 'x-user': 'u9' } }));
  assert.equal(ret.status, 302);
  assert.equal(ret.headers.get('location'), '/?monemee=unlocked');
  assert.equal((await GET(new Request('https://app.example.com/monemee/nix'))).status, 404);

  const { response, access } = await m.guard(new Request('https://app.example.com/api', { headers: { 'x-user': 'u9' } }));
  assert.equal(response, null);
  assert.equal(access.plan, 'pro');
});

test('guard(): Monemee nicht erreichbar → 503 statt Exception (fail closed wie requireAccess)', async () => {
  const m = createMonemee({ appSecret: SECRET, fetch: async () => { throw new Error('ECONNREFUSED'); }, getRef: () => 'u1' });
  const { response, access } = await m.guard(new Request('https://app.example.com/api'));
  assert.equal(access, null);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'monemee_unavailable');
});

// fetch ohne automatische Weiterleitung
function fetch_(url, init = {}) {
  return globalThis.fetch(url, { redirect: 'manual', ...init });
}
