import type { ReactNode, AnchorHTMLAttributes, ReactElement } from 'react';

export interface UnlockResult {
  access: boolean;
  reason: 'no_license' | 'revoked' | 'expired' | 'ref_mismatch' | 'claim_invalid' | 'claim_expired' | 'mode_mismatch' | null;
  plan?: string | null;
  expires_at?: string | null;
}

export interface AccessState {
  loading: boolean;
  access: boolean;
  plan: string | null;
  expiresAt: string | null;
  reason: string | null;
  mode: 'test' | 'live' | null;
  error: Error | null;
  basePath: string;
  refresh(): Promise<unknown>;
  unlock(input: { claim?: string; key?: string }): Promise<UnlockResult>;
  /** Zur Bezahlseite (Kauf ist mit dem eingeloggten Nutzer verknüpft) */
  buy(): Promise<void>;
  /** Nur Testmodus: Testkauf ohne Geld */
  testBuy(opts?: { returnPath?: string }): Promise<void>;
  navigate(url: string): void;
}

export interface MonemeeProviderProps {
  /** Pfad der @monemee/node-Routen · Standard '/monemee' */
  basePath?: string;
  /** Login-Header für Token-Logins, z. B. async () => ({ Authorization: `Bearer ${token}` }) */
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
  /** ?monemee_claim=… automatisch einlösen · Standard true */
  handleReturn?: boolean;
  onUnlocked?: (result: UnlockResult) => void;
  fetch?: typeof fetch;
  navigate?: (url: string) => void;
  children?: ReactNode;
}

export function MonemeeProvider(props: MonemeeProviderProps): ReactElement;
export function useAccess(): AccessState;
export function AccessGate(props: { children?: ReactNode; fallback?: ReactNode; loading?: ReactNode }): ReactElement | null;
export function BuyButton(props: AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode }): ReactElement;
export function LicenseForm(props: { className?: string; label?: string; submitLabel?: string; onUnlocked?: (r: UnlockResult) => void }): ReactElement;
