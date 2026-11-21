'use strict';

const { createApi, MonemeeError } = require('./api');
const { verifyWebhook } = require('./webhook');

const VERSION = require('../package.json').version;
const REF_REGEX = /^[A-Za-z0-9._:@-]{1,128}$/;
const SECRET_REGEX = /^mmapp_(test|live)_[0-9A-Za-z]{32}$/;
const KEY_REGEX = /^MM(-[A-Z0-9]{4}){4}$/i;
const CACHE_EVENTS = new Set(['license.created', 'license.revoked', 'license.activated', 'sale.completed']);

/**
 * createMonemee – Zugang für Web-Apps mit eigenem Login.
 *
 * @param {object} [options]
 * @param {string} [options.appSecret=process.env.MONEMEE_APP_SECRET]  mmapp_test_… / mmapp_live_…
 * @param {string|number} [options.productId=process.env.MONEMEE_PRODUCT_ID]  sonst per /apps/me ermittelt
 * @param {string} [options.webhookSecret=process.env.MONEMEE_WEBHOOK_SECRET]  optional, für sofortige Sperren
 * @param {(req) => string|number|null|Promise<…>} [options.getRef]  Nutzer-ID des eingeloggten Nutzers
 * @param {string} [options.basePath='/monemee']  Pfad der eingebauten Routen
 * @param {string} [options.successPath='/']  Ziel nach dem Freischalten
 * @param {(returnTo: string) => string} [options.loginUrl]  Wohin, wenn beim Rücksprung niemand eingeloggt ist
 * @param {number} [options.cacheSeconds=300]  Wie lange ein Zugangs-Ergebnis zwischengespeichert wird
 * @param {(event) => void|Promise<void>} [options.onEvent]  Webhook-Ereignisse
 * @param {string} [options.baseUrl=process.env.MONEMEE_BASE_URL || 'https://monemee.com']
 * @param {Function} [options.fetch]  eigenes fetch (Tests)
 */
function createMonemee(options = {}) {
  const env = process.env;
  const appSecret = options.appSecret || env.MONEMEE_APP_SECRET;
  if (!appSecret || !SECRET_REGEX.test(appSecret)) {
    throw new MonemeeError(
      'MONEMEE_APP_SECRET fehlt oder ist ungültig. Anlegen mit `npx monemee init` oder im Dashboard unter Lizenzschlüssel → App-Anbindung.',
      { code: 'CONFIG' }
    );
  }
  const mode = appSecret.startsWith('mmapp_test_') ? 'test' : 'live';
  const baseUrl = String(options.baseUrl || env.MONEMEE_BASE_URL || 'https://monemee.com').replace(/\/+$/, '');
  const basePath = `/${String(options.basePath || '/monemee').replace(/^\/+|\/+$/g, '')}`;
  const successPath = options.successPath || '/';
  const cacheMs = (options.cacheSeconds ?? 300) * 1000;
  const webhookSecret = options.webhookSecret || env.MONEMEE_WEBHOOK_SECRET || null;
  const getRef = options.getRef || null;
  const onEvent = options.onEvent || null;
  let productId = options.productId || env.MONEMEE_PRODUCT_ID || null;

  const api = createApi({
    baseUrl,
    appSecret,
    fetchImpl: options.fetch || globalThis.fetch,
    userAgent: `monemee-node/${VERSION}`
  });

  // ---------- Zwischenspeicher für Zugangs-Ergebnisse ----------
  const cache = new Map();
  const cached = (ref) => {
    const hit = cache.get(ref);
    if (hit && hit.until > Date.now()) return hit.value;
    cache.delete(ref);
    return null;
  };
  const remember = (ref, value) => {
    if (cacheMs > 0) cache.set(ref, { value, until: Date.now() + cacheMs });
    if (cache.size > 10000) cache.delete(cache.keys().next().value); // einfache Obergrenze
    return value;
  };

  const normalizeRef = (ref) => {
    if (typeof ref === 'number' && Number.isFinite(ref)) ref = String(ref);
    if (typeof ref !== 'string' || !REF_REGEX.test(ref.trim())) {
      throw new MonemeeError('ref muss eine Nutzer-ID sein (max. 128 Zeichen aus A-Z a-z 0-9 . _ : @ -)', { code: 'INVALID_REF' });
    }
    return ref.trim();
  };

  // ---------- Öffentliche API ----------

  /** Vollständiges Zugangs-Ergebnis { access, reason, plan, expires_at, … } */
  async function access(ref) {
    const r = normalizeRef(ref);
    return cached(r) || remember(r, await api.access(r));
  }

  /** true, wenn der Nutzer Zugang hat. */
  async function hasAccess(ref) {
    return (await access(ref)).access === true;
  }

  /** Rücksprung-Token (claim) oder Lizenzschlüssel (key) einlösen und an ref binden. */
  async function unlock({ claim, key, ref }) {
    const r = normalizeRef(ref);
    if (!claim && !key) throw new MonemeeError('claim oder key ist erforderlich', { code: 'INVALID_INPUT' });
    const result = await api.claim({ claim, key, ref: r });
    cache.delete(r);
    if (result.access) remember(r, result);
    return result;
  }

  /** Kauf-Link, optional schon mit dem Nutzer verknüpft. */
  async function buyUrl(ref) {
    if (!productId) productId = (await api.me()).product_id;
    const url = new URL(`${baseUrl}/buy/${productId}`);
    if (ref !== undefined && ref !== null && ref !== '') url.searchParams.set('ref', normalizeRef(ref));
    return url.toString();
  }

  /** Nur Testmodus: Testkauf ohne Geld. Liefert die Rücksprung-URL mit Token. */
  async function testBuyUrl(ref, { returnUrl } = {}) {
    if (mode !== 'test') throw new MonemeeError('Testkäufe gehen nur mit einem Test-Secret (mmapp_test_…)', { code: 'TEST_ONLY' });
    const result = await api.testClaim({ ref: normalizeRef(ref), returnUrl });
    return result.redirectUrl;
  }

  /** Webhook prüfen (roher Body!), Cache leeren, onEvent aufrufen. */
  async function handleWebhook(rawBody, signatureHeader) {
    const event = verifyWebhook(rawBody, signatureHeader, webhookSecret);
    const ref = event && event.data && event.data.external_ref;
    if (ref && CACHE_EVENTS.has(event.event)) cache.delete(ref);
    if (onEvent) await onEvent(event);
    return event;
  }

  // ---------- Eingebaute Routen (framework-neutral) ----------

  const json = (status, body) => ({ status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
  const redirect = (location) => ({ status: 302, headers: { Location: location, 'Cache-Control': 'no-store' }, body: '' });
  const withParam = (path, key, value) => {
    const u = new URL(path, 'http://x');
    u.searchParams.set(key, value);
    return u.pathname + u.search + u.hash;
  };

  async function resolveRef(req) {
    if (!getRef) {
      throw new MonemeeError('getRef fehlt: createMonemee({ getRef: (req) => req.user?.id })', { code: 'CONFIG' });
    }
    const ref = await getRef(req);
    return ref === undefined || ref === null || ref === '' ? null : normalizeRef(ref);
  }

  /**
   * @param {object} ctx { method, pathname, searchParams, origin, header(name), readBody(), req }
   * @returns {Promise<null | {status, headers, body}>} null = nicht zuständig
   */
  async function handle(ctx) {
    if (!ctx.pathname.startsWith(`${basePath}/`)) return null;
    const route = ctx.pathname.slice(basePath.length);
    const method = ctx.method.toUpperCase();

    try {
      // Rücksprung nach dem Kauf: ?monemee_claim=mmc_…
      if (route === '/return' && method === 'GET') {
        const claim = ctx.searchParams.get('monemee_claim');
        if (!claim) return redirect(withParam(successPath, 'monemee_error', 'claim_missing'));
        const ref = await resolveRef(ctx.req);
        if (!ref) {
          const back = `${ctx.pathname}?monemee_claim=${encodeURIComponent(claim)}`;
          if (options.loginUrl) return redirect(options.loginUrl(back));
          return { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: 'Bitte zuerst einloggen und den Link erneut öffnen.' };
        }
        const result = await unlock({ claim, ref });
        return redirect(result.access
          ? withParam(successPath, 'monemee', 'unlocked')
          : withParam(successPath, 'monemee_error', result.reason || 'unknown'));
      }

      // Kauf starten (BuyButton verlinkt hierher – Produkt-ID und ref bleiben auf dem Server)
      if (route === '/buy' && method === 'GET') {
        const ref = getRef ? await resolveRef(ctx.req) : null;
        return redirect(await buyUrl(ref));
      }

      // Kauf-Link als JSON – für Apps mit Token-Login im Browser (Firebase, Supabase …)
      if (route === '/buy-url' && method === 'GET') {
        const ref = getRef ? await resolveRef(ctx.req) : null;
        return json(200, { url: await buyUrl(ref) });
      }

      // Testkauf ohne Geld (nur Test-Secret)
      if (route === '/test-buy' && method === 'GET') {
        if (mode !== 'test') return json(404, { error: 'not_found' });
        const ref = await resolveRef(ctx.req);
        if (!ref) return json(401, { error: 'login_required' });
        // ?return=… (nur gleiche Herkunft) für Apps, die den Rücksprung im Browser verarbeiten
        const wanted = ctx.searchParams.get('return');
        const returnUrl = wanted && wanted.startsWith('/') && !wanted.startsWith('//')
          ? `${ctx.origin}${wanted}`
          : `${ctx.origin}${basePath}/return`;
        const target = await testBuyUrl(ref, { returnUrl });
        return ctx.searchParams.get('format') === 'json' ? json(200, { url: target }) : redirect(target);
      }

      // Zugangsstatus für das Frontend (@monemee/react)
      if (route === '/access' && method === 'GET') {
        const ref = await resolveRef(ctx.req);
        if (!ref) return json(200, { access: false, reason: 'login_required', buy_url: `${basePath}/buy`, mode });
        const result = await access(ref);
        return json(200, {
          access: result.access,
          reason: result.reason || null,
          plan: result.plan || null,
          expires_at: result.expires_at || null,
          buy_url: `${basePath}/buy`,
          mode
        });
      }

      // Freischalten aus dem Browser: Rücksprung-Token (claim) oder Lizenzschlüssel (key)
      if (route === '/unlock' && method === 'POST') {
        const ref = await resolveRef(ctx.req);
        if (!ref) return json(401, { error: 'login_required' });
        let body = {};
        try { body = JSON.parse((await ctx.readBody()) || '{}'); } catch (_) { return json(400, { error: 'invalid_json' }); }
        const claim = typeof body.claim === 'string' ? body.claim.trim() : '';
        const key = typeof body.key === 'string' ? body.key.trim().toUpperCase() : '';
        if (claim && !/^mmc_[0-9A-Za-z]{32}$/.test(claim)) return json(400, { error: 'invalid_claim' });
        if (!claim && !KEY_REGEX.test(key)) return json(400, { error: 'invalid_key', message: 'Schlüssel im Format MM-XXXX-XXXX-XXXX-XXXX' });
        const result = await unlock(claim ? { claim, ref } : { key, ref });
        return json(200, { access: result.access, reason: result.reason || null, plan: result.plan || null, expires_at: result.expires_at || null });
      }

      // Webhooks von Monemee (Kauf, Erstattung, Sperre)
      if (route === '/webhook' && method === 'POST') {
        if (!webhookSecret) return json(404, { error: 'webhooks_not_configured' });
        try {
          const raw = await ctx.readBody();
          await handleWebhook(raw, ctx.header('monemee-signature'));
        } catch (err) {
          return json(400, { error: 'invalid_signature', message: err.message });
        }
        return json(200, { received: true });
      }

      return null;
    } catch (err) {
      if (err instanceof MonemeeError && (err.code === 'INVALID_REF' || err.code === 'CONFIG')) {
        return json(500, { error: err.code.toLowerCase(), message: err.message });
      }
      const status = err instanceof MonemeeError && err.code === 'NETWORK' ? 503 : 502;
      return json(status, { error: 'monemee_unavailable', message: err.message });
    }
  }

  /**
   * Prüft Zugang für eine geschützte Route.
   * @returns {Promise<{ok: true, access} | {ok: false, response}>}
   */
  async function checkAccess(req, refFn) {
    const ref = refFn ? await refFn(req) : await resolveRef(req);
    if (ref === undefined || ref === null || ref === '') {
      return { ok: false, response: json(401, { error: 'login_required' }) };
    }
    const result = await access(ref);
    if (result.access) return { ok: true, access: result };
    return {
      ok: false,
      response: json(402, { error: 'payment_required', reason: result.reason || null, buy_url: `${basePath}/buy` })
    };
  }

  return {
    mode,
    basePath,
    access,
    hasAccess,
    unlock,
    buyUrl,
    testBuyUrl,
    handleWebhook,
    clearCache: (ref) => (ref === undefined ? cache.clear() : cache.delete(String(ref))),
    // intern für Adapter
    _handle: handle,
    _checkAccess: checkAccess
  };
}

module.exports = { createMonemee, MonemeeError, VERSION };
