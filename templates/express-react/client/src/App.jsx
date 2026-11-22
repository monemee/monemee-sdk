import { useEffect, useState } from 'react';
import { MonemeeProvider, AccessGate, BuyButton, LicenseForm, useAccess } from 'monemee-react';

export default function App() {
  const [user, setUser] = useState(undefined);
  useEffect(() => { fetch('/api/me').then((r) => r.json()).then((d) => setUser(d.user)); }, []);

  if (user === undefined) return <main><p>Loading…</p></main>;
  if (!user) return <main><Login onLogin={setUser} /></main>;

  return (
    <main>
      <header>
        <span>Hi {user.id}</span>
        <button type="button" onClick={() => fetch('/api/logout', { method: 'POST' }).then(() => setUser(null))}>Log out</button>
      </header>
      <h1>My App</h1>
      <p>This part is free.</p>

      <MonemeeProvider>
        <AccessGate loading={<p>Checking access…</p>} fallback={<Paywall />}>
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
      <h2>Unlock Pro</h2>
      <p>All pro features, pay once.</p>
      <BuyButton className="primary">Buy now</BuyButton>
      {mode === 'test' && <button type="button" onClick={() => testBuy()}>Test purchase (no payment)</button>}
      <details>
        <summary>Already bought? Enter your license key</summary>
        <LicenseForm label="License key" submitLabel="Unlock" />
      </details>
    </section>
  );
}

function ProArea() {
  const [data, setData] = useState(null);
  useEffect(() => { fetch('/api/pro').then((r) => r.json()).then(setData); }, []);
  return (
    <section className="card">
      <h2>Pro area</h2>
      <p>{data ? data.message : 'Loading…'}</p>
      {data?.test && <p className="hint">Test purchase. In live mode this is a real payment.</p>}
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
      <h1>Demo login</h1>
      <label>Name <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></label>
      <button className="primary" type="submit">Log in</button>
    </form>
  );
}
