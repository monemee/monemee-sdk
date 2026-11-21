import { useEffect, useState } from 'react';
import { MonemeeProvider, AccessGate, BuyButton, LicenseForm, useAccess } from '@monemee/react';

export default function App() {
  const [user, setUser] = useState(undefined);
  useEffect(() => { fetch('/api/me').then((r) => r.json()).then((d) => setUser(d.user)); }, []);

  if (user === undefined) return <main><p>Lädt …</p></main>;
  if (!user) return <main><Login onLogin={setUser} /></main>;

  return (
    <main>
      <header>
        <span>Hallo {user.id}</span>
        <button type="button" onClick={() => fetch('/api/logout', { method: 'POST' }).then(() => setUser(null))}>Abmelden</button>
      </header>
      <h1>Meine App</h1>
      <p>Das hier ist kostenlos.</p>

      <MonemeeProvider>
        <AccessGate loading={<p>Prüfe Zugang …</p>} fallback={<Paywall />}>
          <ProArea />
        </AccessGate>
      </MonemeeProvider>
    </main>
  );
}

function Paywall() {
  const { mode, testBuy } = useAccess();
  return (
    <section className="card">
      <h2>Pro freischalten</h2>
      <p>Alle Profi-Funktionen, einmal zahlen.</p>
      <BuyButton className="primary">Jetzt kaufen</BuyButton>
      {mode === 'test' && <button type="button" onClick={() => testBuy()}>Testkauf (ohne Geld)</button>}
      <details>
        <summary>Schon gekauft? Lizenzschlüssel eingeben</summary>
        <LicenseForm />
      </details>
    </section>
  );
}

function ProArea() {
  const [data, setData] = useState(null);
  useEffect(() => { fetch('/api/pro').then((r) => r.json()).then(setData); }, []);
  return (
    <section className="card">
      <h2>Pro-Bereich</h2>
      <p>{data ? data.message : 'Lädt …'}</p>
      {data?.test && <p className="hint">Testkauf – im Live-Modus zahlt hier echtes Geld.</p>}
    </section>
  );
}

function Login({ onLogin }) {
  const [name, setName] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    if (res.ok) {
      const next = new URLSearchParams(window.location.search).get('next');
      if (next && next.startsWith('/') && !next.startsWith('//')) window.location.assign(next);
      else onLogin(await res.json());
    }
  };
  return (
    <form className="card" onSubmit={submit}>
      <h1>Demo-Login</h1>
      <label>Name <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></label>
      <button className="primary" type="submit">Einloggen</button>
    </form>
  );
}
