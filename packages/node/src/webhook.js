'use strict';

const crypto = require('crypto');

/**
 * Prüft die Signatur eines Monemee-Webhooks.
 * Header: `Monemee-Signature: t=<unix>,v1=<hex hmac_sha256(secret, "<t>.<rawBody>")>`
 *
 * @param {string|Buffer} rawBody  Der UNVERÄNDERTE Request-Body
 * @param {string} header          Wert des Monemee-Signature-Headers
 * @param {string} secret          Webhook-Secret (whsec_…)
 * @param {object} [opts]
 * @param {number} [opts.toleranceSeconds=300]  Älter → abgelehnt (Replay-Schutz)
 * @returns {object} Das geparste Event { event, created, data }
 * @throws {Error} bei fehlender/falscher/zu alter Signatur
 */
function verifyWebhook(rawBody, header, secret, { toleranceSeconds = 300, now = Date.now() } = {}) {
  if (!secret) throw new Error('Webhook-Secret fehlt (MONEMEE_WEBHOOK_SECRET)');
  if (typeof header !== 'string' || !header) throw new Error('Monemee-Signature-Header fehlt');

  const parts = Object.fromEntries(
    header.split(',').map((p) => p.trim().split('=')).filter((kv) => kv.length === 2)
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isInteger(t) || !v1 || !/^[0-9a-f]{64}$/.test(v1)) throw new Error('Signatur hat ein ungültiges Format');
  if (Math.abs(Math.floor(now / 1000) - t) > toleranceSeconds) throw new Error('Signatur ist zu alt');

  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(v1, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('Signatur stimmt nicht');

  return JSON.parse(body);
}

module.exports = { verifyWebhook };
