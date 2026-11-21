export interface LicenseResult {
  valid: boolean;
  reason: 'not_activated' | 'not_found' | 'product_mismatch' | 'revoked' | 'expired' | 'device_not_activated'
    | 'activation_limit' | 'offline' | 'invalid_signature' | null;
  plan: string | null;
  expiresAt: string | null;
  test: boolean;
  offline?: boolean;
  activations?: { used: number; max: number | null } | null;
}

export interface LicenseStorage {
  get(key: string): Promise<string | null> | string | null;
  set(key: string, value: string): Promise<void> | void;
  remove(key: string): Promise<void> | void;
}

export interface LicenseOptions {
  productId: number;
  baseUrl?: string;
  /** So lange gilt die letzte Prüfung ohne Netz · Standard 7 */
  graceDays?: number;
  appName?: string;
  storage?: LicenseStorage;
  deviceId?: string;
  deviceName?: string;
  publicKeys?: Array<{ kid: string; x: string }>;
  fetch?: typeof fetch;
  now?: () => number;
}

export interface License {
  activate(key: string, opts?: { deviceName?: string }): Promise<LicenseResult>;
  check(): Promise<LicenseResult>;
  deactivate(): Promise<{ deactivated: boolean }>;
  storedKey(): Promise<string | null>;
  deviceId(): Promise<string>;
}

export function createLicense(options: LicenseOptions): License;
export function verifySigned(signed: { payload: string; signature: string; kid: string }, publicKeys: Array<{ kid: string; x: string }>): Promise<Record<string, unknown> | null>;
export const BUNDLED_PUBLIC_KEYS: Array<{ kid: string; x: string }>;
export class LicenseError extends Error { code: string; }
