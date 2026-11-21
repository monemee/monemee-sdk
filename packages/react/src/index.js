import { createContext, createElement as h, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/**
 * @monemee/react – Freischalten im Frontend.
 * Spricht nur mit DEINEM Server (die Routen von @monemee/node unter basePath).
 * Kein Secret im Browser.
 */

const MonemeeContext = createContext(null);
const CLAIM_PARAM = 'monemee_claim';

const INITIAL = { loading: true, access: false, plan: null, expiresAt: null, reason: null, mode: null, error: null };

/** Entfernt ?monemee_claim=… aus der Adresszeile, ohne neu zu laden. */
function stripClaimFromUrl() {
  if (typeof window === 'undefined' || !window.history || !window.history.replaceState) return;
  const url = new URL(window.location.href);
  url.searchParams.delete(CLAIM_PARAM);
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

/**
 * @param {object} props
 * @param {string} [props.basePath='/monemee']  Pfad der @monemee/node-Routen (gleiche Herkunft oder volle URL)
 * @param {() => object|Promise<object>} [props.getHeaders]  z. B. async () => ({ Authorization: `Bearer ${await user.getIdToken()}` })
 * @param {boolean} [props.handleReturn=true]  ?monemee_claim=… automatisch einlösen
 * @param {(result) => void} [props.onUnlocked]
 * @param {typeof fetch} [props.fetch]
 * @param {(url: string) => void} [props.navigate]  Standard: window.location.assign
 */
export function MonemeeProvider({ basePath = '/monemee', getHeaders, handleReturn = true, onUnlocked, fetch: fetchImpl, navigate, children }) {
  const [state, setState] = useState(INITIAL);
  const base = basePath.replace(/\/+$/, '');
  const opts = useRef({ getHeaders, onUnlocked, fetchImpl, navigate });
  opts.current = { getHeaders, onUnlocked, fetchImpl, navigate };
  const go = (url) => (opts.current.navigate ? opts.current.navigate(url) : window.location.assign(url));

  const call = useCallback(async (path, init = {}) => {
    const f = opts.current.fetchImpl || globalThis.fetch;
    const extra = opts.current.getHeaders ? await opts.current.getHeaders() : {};
    const res = await f(`${base}${path}`, {
      credentials: 'include',
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...extra, ...(init.headers || {}) }
    });
    let body = null;
    try { body = await res.json(); } catch (_) { /* leer */ }
    if (!res.ok) {
      const err = new Error((body && (body.message || body.error)) || `HTTP ${res.status}`);
      err.status = res.status;
      err.code = body && body.error;
      throw err;
    }
    return body;
  }, [base]);

  const refresh = useCallback(async () => {
    try {
      const data = await call('/access');
      setState({
        loading: false,
        access: Boolean(data.access),
        plan: data.plan || null,
        expiresAt: data.expires_at || null,
        reason: data.reason || null,
        mode: data.mode || null,
        error: null
      });
      return data;
    } catch (error) {
      setState((s) => ({ ...s, loading: false, error }));
      return null;
    }
  }, [call]);

  const unlock = useCallback(async ({ claim, key }) => {
    const result = await call('/unlock', { method: 'POST', body: JSON.stringify(claim ? { claim } : { key }) });
    await refresh();
    if (result && result.access && opts.current.onUnlocked) opts.current.onUnlocked(result);
    return result;
  }, [call, refresh]);

  const buy = useCallback(async () => {
    const { url } = await call('/buy-url');
    go(url);
  }, [call]); // eslint-disable-line react-hooks/exhaustive-deps

  const testBuy = useCallback(async ({ returnPath } = {}) => {
    const path = returnPath || (typeof window !== 'undefined' ? window.location.pathname : '/');
    const { url } = await call(`/test-buy?format=json&return=${encodeURIComponent(path)}`);
    go(url);
  }, [call]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let active = true;
    (async () => {
      const claim = handleReturn && typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get(CLAIM_PARAM)
        : null;
      if (claim) {
        stripClaimFromUrl();
        try {
          await unlock({ claim });
          return;
        } catch (error) {
          if (active) setState((s) => ({ ...s, error }));
        }
      }
      if (active) await refresh();
    })();
    return () => { active = false; };
  }, [handleReturn, refresh, unlock]);

  const value = useMemo(() => ({ ...state, refresh, unlock, buy, testBuy, basePath: base, navigate: go }), [state, refresh, unlock, buy, testBuy, base]); // eslint-disable-line react-hooks/exhaustive-deps
  return h(MonemeeContext.Provider, { value }, children);
}

/** { loading, access, plan, expiresAt, reason, mode, error, refresh, unlock, buy, testBuy } */
export function useAccess() {
  const ctx = useContext(MonemeeContext);
  if (!ctx) throw new Error('useAccess() braucht einen <MonemeeProvider> weiter oben im Baum.');
  return ctx;
}

/** Zeigt children nur mit Zugang, sonst fallback (z. B. <BuyButton />). */
export function AccessGate({ children, fallback = null, loading = null }) {
  const a = useAccess();
  if (a.loading) return loading;
  return a.access ? children : fallback;
}

/** Kauf-Knopf. Funktioniert mit Cookie- und Token-Login. */
export function BuyButton({ children = 'Jetzt freischalten', className, style, ...rest }) {
  const a = useAccess();
  const [busy, setBusy] = useState(false);
  const onClick = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await a.buy();
    } catch (_) {
      // Fallback: klassischer Link (Cookie-Login)
      a.navigate(`${a.basePath}/buy`);
    } finally {
      setBusy(false);
    }
  };
  return h('a', { href: `${a.basePath}/buy`, onClick, className, style, 'aria-busy': busy || undefined, ...rest }, children);
}

/** Feld für den Lizenzschlüssel – für Käufer, die ohne Rücksprung gekauft haben. */
export function LicenseForm({ className, label = 'Lizenzschlüssel', submitLabel = 'Freischalten', onUnlocked }) {
  const a = useAccess();
  const [key, setKey] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const r = await a.unlock({ key: key.trim() });
      if (r.access) {
        setKey('');
        if (onUnlocked) onUnlocked(r);
      } else {
        setMessage(REASON_TEXT[r.reason] || 'Dieser Schlüssel schaltet nichts frei.');
      }
    } catch (err) {
      setMessage(err.code === 'invalid_key' ? 'Bitte im Format MM-XXXX-XXXX-XXXX-XXXX eingeben.' : 'Freischalten hat nicht geklappt. Bitte später erneut versuchen.');
    } finally {
      setBusy(false);
    }
  };

  return h('form', { className, onSubmit },
    h('label', null, label,
      h('input', {
        value: key,
        onChange: (e) => setKey(e.target.value),
        placeholder: 'MM-XXXX-XXXX-XXXX-XXXX',
        autoComplete: 'off',
        spellCheck: false,
        required: true
      })),
    h('button', { type: 'submit', disabled: busy }, submitLabel),
    message ? h('p', { role: 'alert' }, message) : null
  );
}

const REASON_TEXT = {
  no_license: 'Zu diesem Schlüssel gibt es keinen Kauf für diese App.',
  revoked: 'Dieser Schlüssel wurde gesperrt (z. B. nach einer Erstattung).',
  expired: 'Dieser Schlüssel ist abgelaufen.',
  ref_mismatch: 'Dieser Schlüssel gehört schon zu einem anderen Konto.',
  mode_mismatch: 'Testschlüssel funktionieren nur im Testmodus (und umgekehrt).'
};
