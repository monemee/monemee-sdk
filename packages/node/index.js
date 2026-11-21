'use strict';

const { createMonemee: createCore, MonemeeError, VERSION } = require('./src/core');
const adapters = require('./src/adapters');
const { verifyWebhook } = require('./src/webhook');

/**
 * Monemee für Web-Apps mit Login.
 *
 *   const monemee = require('@monemee/node')({ getRef: (req) => req.user?.id });
 *   app.use(monemee.webhook());                                 // ganz oben, vor express.json()
 *   …express.json(), Session/Login…
 *   app.use(monemee.routes());                                  // nach deiner Login-Middleware
 *   app.get('/api/pro', monemee.requireAccess(), handler);
 *
 * Siehe README.md für Next.js, Fastify und Webhooks.
 */
function createMonemee(options) {
  const core = createCore(options);
  return Object.assign(core, {
    /** Express/Connect/Node-Middleware für /monemee/* – NACH deiner Login-Middleware einbinden */
    routes: () => adapters.expressRoutes(core),
    /** Nur POST /monemee/webhook – ganz oben, VOR express.json() (braucht den rohen Body) */
    webhook: () => adapters.expressWebhook(core),
    /** Express-Middleware: nur mit Zugang weiter (setzt req.monemee), sonst 401/402 */
    requireAccess: (getRef) => adapters.expressRequireAccess(core, getRef),
    /** Web-Standard: Request → Response | null */
    handleRequest: (request) => adapters.handleRequest(core, request),
    /** Next.js App Router: export const { GET, POST } = monemee.nextRoute() */
    nextRoute: () => adapters.nextRoute(core),
    /** Web-Handler-Schutz: const { response } = await monemee.guard(request); if (response) return response; */
    guard: (request, getRef) => adapters.guard(core, request, getRef)
  });
}

module.exports = createMonemee;
module.exports.createMonemee = createMonemee;
module.exports.default = createMonemee;
module.exports.verifyWebhook = verifyWebhook;
module.exports.MonemeeError = MonemeeError;
module.exports.VERSION = VERSION;
