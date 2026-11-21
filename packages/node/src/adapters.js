'use strict';

/**
 * Adapter: Node/Express (req, res, next) und Web-Standard (Request → Response).
 */

const MAX_BODY_BYTES = 1024 * 1024;

const RAW_BODY_HINT =
  'Der Request-Body wurde schon von einem Body-Parser gelesen. Binde monemee.routes() VOR express.json() ein ' +
  '(oder stelle req.rawBody bereit), damit Webhook-Signaturen geprüft werden können.';

function readNodeBody(req, { raw }) {
  if (req.rawBody !== undefined) {
    return Promise.resolve(Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : String(req.rawBody));
  }
  if (req.body !== undefined && req.readableEnded !== false) {
    // Body-Parser war schon dran
    if (raw) return Promise.reject(new Error(RAW_BODY_HINT));
    if (typeof req.body === 'string') return Promise.resolve(req.body);
    if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body.toString('utf8'));
    return Promise.resolve(JSON.stringify(req.body || {}));
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request-Body zu groß'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function nodeOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || (req.socket && req.socket.encrypted ? 'https' : 'http')).split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return `${proto}://${String(host).split(',')[0].trim()}`;
}

function sendNode(res, out) {
  res.statusCode = out.status;
  for (const [k, v] of Object.entries(out.headers || {})) res.setHeader(k, v);
  res.end(out.body || '');
}

function nodeContext(req) {
  const origin = nodeOrigin(req);
  const url = new URL(req.originalUrl || req.url || '/', origin);
  return {
    method: req.method || 'GET',
    pathname: url.pathname,
    searchParams: url.searchParams,
    origin,
    header: (name) => {
      const v = req.headers[name.toLowerCase()];
      return Array.isArray(v) ? v[0] : v;
    },
    readBody: () => readNodeBody(req, { raw: url.pathname.endsWith('/webhook') }),
    req
  };
}

/** Express/Connect/Node-Middleware für die eingebauten Routen unter basePath. */
function expressRoutes(monemee) {
  return function monemeeRoutes(req, res, next) {
    const ctx = nodeContext(req);
    monemee._handle(ctx).then((out) => {
      if (!out) return typeof next === 'function' ? next() : sendNode(res, { status: 404, headers: {}, body: 'Not found' });
      return sendNode(res, out);
    }, (err) => (typeof next === 'function' ? next(err) : sendNode(res, { status: 500, headers: {}, body: 'Internal error' })));
  };
}

/** Express-Middleware: nur mit Zugang weiter, sonst 401/402 mit buy_url. */
function expressRequireAccess(monemee, getRef) {
  return function requireAccess(req, res, next) {
    monemee._checkAccess(req, getRef).then((r) => {
      if (r.ok) {
        req.monemee = r.access;
        return next();
      }
      return sendNode(res, r.response);
    }, (err) => {
      // Monemee nicht erreichbar → nicht still freischalten
      sendNode(res, {
        status: 503,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ error: 'monemee_unavailable', message: err.message })
      });
      if (typeof next !== 'function') return;
    });
  };
}

// ---------- Web-Standard (Next.js App Router, Hono, Bun, Deno, Workers) ----------

function webContext(request) {
  const url = new URL(request.url);
  return {
    method: request.method,
    pathname: url.pathname,
    searchParams: url.searchParams,
    origin: url.origin,
    header: (name) => request.headers.get(name),
    readBody: () => request.text(),
    req: request
  };
}

function toResponse(out) {
  return new Response(out.status === 302 ? null : out.body, { status: out.status, headers: out.headers });
}

/** Request → Response | null (null = nicht zuständig) */
async function handleRequest(monemee, request) {
  const out = await monemee._handle(webContext(request));
  return out ? toResponse(out) : null;
}

/**
 * Next.js App Router: app/monemee/[...monemee]/route.js
 *   export const { GET, POST } = monemee.nextRoute();
 */
function nextRoute(monemee) {
  const handler = async (request) =>
    (await handleRequest(monemee, request)) || new Response('Not found', { status: 404 });
  return { GET: handler, POST: handler };
}

/** Für Web-Handler: Response bei fehlendem Zugang, sonst null + Ergebnis. */
async function guard(monemee, request, getRef) {
  const r = await monemee._checkAccess(request, getRef);
  return r.ok ? { response: null, access: r.access } : { response: toResponse(r.response), access: null };
}

module.exports = { expressRoutes, expressRequireAccess, handleRequest, nextRoute, guard, RAW_BODY_HINT };
