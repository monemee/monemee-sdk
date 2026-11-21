import 'global-jsdom/register';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { MonemeeProvider, AccessGate, BuyButton, LicenseForm, useAccess } from '../src/index.js';

/** Fake-Server: nimmt Pfad + Body auf, antwortet aus einer Tabelle. */
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = new URL(url, 'http://localhost');
    calls.push({ path: u.pathname + u.search, body: init.body ? JSON.parse(init.body) : null, headers: init.headers });
    const handler = routes[u.pathname];
    const [status, body] = typeof handler === 'function' ? handler(init.body ? JSON.parse(init.body) : null, u) : handler || [404, {}];
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  fn.calls = calls;
  return fn;
}

const ui = (fetch, props = {}) =>
  h(MonemeeProvider, { fetch, ...props },
    h(AccessGate, { loading: h('p', null, 'lädt'), fallback: h(BuyButton, null, 'Pro kaufen') }, h('p', null, 'Pro-Inhalt')));

test.afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

test('ohne Kauf: Kauf-Knopf, mit Kauf: Inhalt', async () => {
  let granted = false;
  const fetch = fakeFetch({ '/monemee/access': () => [200, { access: granted, plan: granted ? 'pro' : null, mode: 'test' }] });
  render(ui(fetch));
  assert.ok(screen.getByText('lädt'));
  await waitFor(() => assert.ok(screen.getByText('Pro kaufen')));
  assert.equal(screen.getByText('Pro kaufen').getAttribute('href'), '/monemee/buy');

  cleanup();
  granted = true;
  render(ui(fetch));
  await waitFor(() => assert.ok(screen.getByText('Pro-Inhalt')));
});

test('Rücksprung: ?monemee_claim wird mit Login-Header eingelöst und aus der Adresse entfernt', async () => {
  const claim = `mmc_${'Q'.repeat(32)}`;
  window.history.replaceState(null, '', `/pro?tab=1&monemee_claim=${claim}`);
  let granted = false;
  const unlocked = [];
  const fetch = fakeFetch({
    '/monemee/unlock': (body) => { granted = body.claim === claim; return [200, { access: granted, plan: 'pro' }]; },
    '/monemee/access': () => [200, { access: granted, plan: 'pro' }]
  });
  render(ui(fetch, { getHeaders: async () => ({ Authorization: 'Bearer firebase-token' }), onUnlocked: (r) => unlocked.push(r) }));

  await waitFor(() => assert.ok(screen.getByText('Pro-Inhalt')));
  assert.equal(window.location.pathname + window.location.search, '/pro?tab=1');
  assert.deepEqual(fetch.calls[0].body, { claim });
  assert.equal(fetch.calls[0].headers.Authorization, 'Bearer firebase-token');
  assert.equal(unlocked.length, 1);
});

test('BuyButton holt den Kauf-Link mit Login-Header (Token-Login)', async () => {
  const fetch = fakeFetch({
    '/monemee/access': [200, { access: false, reason: 'no_license' }],
    '/monemee/buy-url': [200, { url: 'https://monemee.com/buy/5?ref=u1' }]
  });
  const assigned = [];
  render(ui(fetch, { getHeaders: () => ({ Authorization: 'Bearer t' }), navigate: (u) => assigned.push(u) }));
  await waitFor(() => screen.getByText('Pro kaufen'));
  fireEvent.click(screen.getByText('Pro kaufen'));
  await waitFor(() => assert.deepEqual(assigned, ['https://monemee.com/buy/5?ref=u1']));
  const buyCall = fetch.calls.find((c) => c.path === '/monemee/buy-url');
  assert.equal(buyCall.headers.Authorization, 'Bearer t');
});

test('LicenseForm: Fehlermeldung bei fremdem Schlüssel, Erfolg schaltet frei', async () => {
  let granted = false;
  const fetch = fakeFetch({
    '/monemee/access': () => [200, { access: granted }],
    '/monemee/unlock': (body) => {
      if (body.key === 'MM-AAAA-AAAA-AAAA-AAAA') { granted = true; return [200, { access: true }]; }
      return [200, { access: false, reason: 'ref_mismatch' }];
    }
  });
  function Status() {
    const a = useAccess();
    return h('span', { 'data-testid': 'status' }, a.access ? 'frei' : 'gesperrt');
  }
  render(h(MonemeeProvider, { fetch }, h(Status), h(LicenseForm)));
  await waitFor(() => assert.equal(screen.getByTestId('status').textContent, 'gesperrt'));

  const input = screen.getByPlaceholderText('MM-XXXX-XXXX-XXXX-XXXX');
  fireEvent.change(input, { target: { value: 'MM-BBBB-BBBB-BBBB-BBBB' } });
  fireEvent.click(screen.getByText('Freischalten'));
  await waitFor(() => assert.match(screen.getByRole('alert').textContent, /anderen Konto/));

  fireEvent.change(input, { target: { value: 'MM-AAAA-AAAA-AAAA-AAAA' } });
  fireEvent.click(screen.getByText('Freischalten'));
  await waitFor(() => assert.equal(screen.getByTestId('status').textContent, 'frei'));
});

test('useAccess ohne Provider → verständlicher Fehler', () => {
  function Bad() { useAccess(); return null; }
  const original = console.error;
  console.error = () => {};
  try {
    assert.throws(() => render(h(Bad)), /MonemeeProvider/);
  } finally {
    console.error = original;
  }
});
