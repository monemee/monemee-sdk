/// <reference types="node" />
import type { IncomingMessage, ServerResponse } from 'http';

export type Ref = string | number;
export type RefResolver<R = any> = (req: R) => Ref | null | undefined | Promise<Ref | null | undefined>;

export type AccessReason =
  | 'no_license' | 'revoked' | 'expired' | 'ref_mismatch'
  | 'claim_invalid' | 'claim_expired' | 'mode_mismatch';

export interface AccessResult {
  access: boolean;
  reason: AccessReason | null;
  ref: string;
  plan?: string | null;
  expires_at?: string | null;
  license_id?: number;
  test?: boolean;
}

export interface MonemeeEvent {
  event: 'sale.completed' | 'license.created' | 'license.revoked' | 'license.activated' | string;
  created: number;
  data: Record<string, unknown> & { external_ref?: string | null };
}

export interface MonemeeOptions<R = any> {
  /** mmapp_test_… oder mmapp_live_… · Standard: process.env.MONEMEE_APP_SECRET */
  appSecret?: string;
  /** Standard: process.env.MONEMEE_PRODUCT_ID, sonst per API ermittelt */
  productId?: string | number;
  /** Für Webhooks (sofortige Sperre bei Erstattung) · Standard: process.env.MONEMEE_WEBHOOK_SECRET */
  webhookSecret?: string;
  /** Nutzer-ID des eingeloggten Nutzers aus dem Request */
  getRef?: RefResolver<R>;
  /** Pfad der eingebauten Routen · Standard: '/monemee' */
  basePath?: string;
  /** Ziel nach dem Freischalten · Standard: '/' */
  successPath?: string;
  /** Login-Seite, falls beim Rücksprung niemand eingeloggt ist */
  loginUrl?: (returnTo: string) => string;
  /** Zwischenspeicher für Zugangs-Ergebnisse in Sekunden · Standard: 300 */
  cacheSeconds?: number;
  /** Webhook-Ereignisse (nach Signaturprüfung) */
  onEvent?: (event: MonemeeEvent) => void | Promise<void>;
  /** Standard: process.env.MONEMEE_BASE_URL oder https://monemee.com */
  baseUrl?: string;
  fetch?: typeof fetch;
}

export type NodeMiddleware = (req: IncomingMessage & Record<string, any>, res: ServerResponse, next?: (err?: unknown) => void) => void;

export interface Monemee<R = any> {
  readonly mode: 'test' | 'live';
  readonly basePath: string;
  access(ref: Ref): Promise<AccessResult>;
  hasAccess(ref: Ref): Promise<boolean>;
  unlock(input: { claim?: string; key?: string; ref: Ref }): Promise<AccessResult>;
  buyUrl(ref?: Ref | null): Promise<string>;
  testBuyUrl(ref: Ref, opts?: { returnUrl?: string }): Promise<string>;
  handleWebhook(rawBody: string | Buffer, signatureHeader: string): Promise<MonemeeEvent>;
  clearCache(ref?: Ref): void;
  /** Express/Connect/Node: /monemee/return|buy|buy-url|access|unlock|test-buy – NACH deiner Login-Middleware */
  routes(): NodeMiddleware;
  /** Nur POST /monemee/webhook – ganz oben, VOR express.json() (braucht den rohen Body) */
  webhook(): NodeMiddleware;
  /** Express: nur mit Zugang weiter (req.monemee = AccessResult), sonst 401/402 */
  requireAccess(getRef?: RefResolver<R>): NodeMiddleware;
  /** Web-Standard: Request → Response | null */
  handleRequest(request: Request): Promise<Response | null>;
  /** Next.js App Router: export const { GET, POST } = monemee.nextRoute() */
  nextRoute(): { GET: (request: Request) => Promise<Response>; POST: (request: Request) => Promise<Response> };
  /** Web-Handler: const { response } = await monemee.guard(request); if (response) return response; */
  guard(request: Request, getRef?: RefResolver<Request>): Promise<{ response: Response | null; access: AccessResult | null }>;
}

export class MonemeeError extends Error {
  status: number | null;
  code: string | null;
}

export function verifyWebhook(rawBody: string | Buffer, header: string, secret: string, opts?: { toleranceSeconds?: number }): MonemeeEvent;

declare function createMonemee<R = any>(options?: MonemeeOptions<R>): Monemee<R>;
export { createMonemee };
export const VERSION: string;
export default createMonemee;
