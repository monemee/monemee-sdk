import { accessToken } from './oauth.js';

/** Public API (Login-Token) und App-API (App-Secret). */

export class CliError extends Error {}

async function request(url, { method = 'GET', body, token }) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${token}`,
        'User-Agent': 'monemee-cli'
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (err) {
    throw new CliError(`Monemee nicht erreichbar (${err.message}).`);
  }
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) throw new CliError('Nicht eingeloggt oder Login abgelaufen. Bitte `npx monemee login` ausführen.');
  if (!res.ok || json.success === false) throw new CliError(json.message || `Monemee antwortete mit HTTP ${res.status}`);
  return json.data;
}

export function publicApi(base) {
  const call = async (method, path, body) => {
    const token = await accessToken(base);
    if (!token) throw new CliError('Nicht eingeloggt. Bitte `npx monemee login` ausführen.');
    return request(`${base}/api/v1/public${path}`, { method, body, token });
  };
  return {
    me: () => call('GET', '/me'),
    products: () => call('GET', '/products'),
    product: (id) => call('GET', `/products/${id}`),
    createProduct: (data) => call('POST', '/products', data),
    updateProduct: (id, data) => call('PATCH', `/products/${id}`, data),
    createAppSecret: (id, mode) => call('POST', `/products/${id}/app-secrets`, { mode }),
    createWebhook: (data) => call('POST', '/webhooks', data)
  };
}

export function appApi(base, secret) {
  const call = (method, path, body) => request(`${base}/api/v1/apps${path}`, { method, body, token: secret });
  return {
    me: () => call('GET', '/me'),
    testClaim: (ref, returnUrl) => call('POST', '/test-claim', { ref, return_url: returnUrl })
  };
}
