---
title: Add a paywall to an Express and React app
description: Sell access to an Express and React app with monemee-node and monemee-react. Middleware order, requireAccess(), webhooks and the React paywall.
permalink: /guides/express-react-paywall/
updated: 2026-11-22
last_modified_at: 2026-11-22
faq:
  - q: Why must monemee.webhook() come before express.json()?
    a: Webhook signatures are computed over the raw request body. Once express.json() has parsed the body, the original bytes are gone and the signature cannot be verified, so the webhook middleware has to run first.
  - q: What does requireAccess() send when the user has not paid?
    a: 401 with error login_required when getRef returns nothing, 402 with error payment_required and a buy_url when there is no valid license, and 503 when Monemee cannot be reached. It never grants access on errors.
  - q: Does npx monemee init change my server code?
    a: Yes, if it finds exactly one express() call and a first route after it. It adds the Monemee instance, app.use(monemee.webhook()) right after express() and app.use(monemee.routes()) before your first route. Otherwise it prints the snippet for you to paste.
---

# Add a paywall to an Express and React app

<p class="lead">To add a paywall to an Express and React app, create a <code>monemee-node</code> instance whose <code>getRef</code> returns the logged-in user ID, mount <code>webhook()</code> before <code>express.json()</code> and <code>routes()</code> after your login, protect paid routes with <code>requireAccess()</code> and wrap paid UI in <code>&lt;AccessGate&gt;</code>. <code>npx monemee init</code> does most of this for you.</p>

## Prerequisites

- An Express server with a login (sessions, Passport, a token check) and a React frontend.
- Node.js 18.17 or newer.
- A Monemee account. The setup creates the product and a test secret.

## Steps

### 1. Run the setup

```bash
npx monemee init
```

`init` detects Express and React (also in `server/` and `client/` subfolders), writes `MONEMEE_APP_SECRET` and `MONEMEE_PRODUCT_ID` to the server's `.env`, adds `.env` to `.gitignore`, patches your server file and creates `src/components/MonemeeUpgrade.jsx` in the React app. Check the result against the next steps.

By hand: `npm install monemee-node` on the server, `npm install monemee-react` in the frontend, and a test secret from the dashboard under *License keys > App connection*.

### 2. Load the .env file

`monemee-node` reads `process.env`. It does not load `.env` itself:

```bash
node --env-file=.env server.js        # Node.js 20.6 or newer
```

or `require('dotenv').config()` at the top of the server file.

### 3. Mount Monemee in the right order

```js
// server.js
const express = require('express');
const session = require('express-session');
const createMonemee = require('monemee-node');

const app = express();
const monemee = createMonemee({
  getRef: (req) => req.user?.id,                              // stable user ID from your login
  loginUrl: (back) => `/login?next=${encodeURIComponent(back)}`, // buyers who return logged out
  successPath: '/pro'                                          // where buyers land after paying
});

app.use(monemee.webhook());   // 1. before express.json(): needs the raw body
app.use(express.json());      // 2. body parser
app.use(session({ /* ... */ })); // 3. your login, sets req.user
app.use(monemee.routes());    // 4. /monemee/buy, /return, /access, /unlock, /test-buy

app.get('/api/pro', monemee.requireAccess(), (req, res) => {
  res.json({ plan: req.monemee.plan });
});

app.listen(3001);
```

`getRef` must return the same stable ID every time, never an email address. `requireAccess()` puts the access result on `req.monemee`.

### 4. Add the paywall in React

```jsx
// src/Pro.jsx
import { MonemeeProvider, AccessGate, BuyButton, LicenseForm, useAccess } from 'monemee-react';

function Offer() {
  const { mode, testBuy } = useAccess();
  return (
    <div>
      <BuyButton>Unlock Pro</BuyButton>
      {mode === 'test' && <button type="button" onClick={() => testBuy()}>Test purchase</button>}
      <details>
        <summary>Already bought? Enter your license key</summary>
        <LicenseForm />
      </details>
    </div>
  );
}

export default function Pro() {
  return (
    <MonemeeProvider>
      <AccessGate loading={<p>Loading...</p>} fallback={<Offer />}>
        <ProFeature />
      </AccessGate>
    </MonemeeProvider>
  );
}
```

The provider calls `/monemee/access` on your server with cookies included. If the frontend dev server runs on another port, proxy `/monemee` and `/api` to Express. With Vite:

```js
// vite.config.js
export default { server: { proxy: { '/api': 'http://localhost:3001', '/monemee': 'http://localhost:3001' } } };
```

### 5. Token login (Firebase, Supabase, Auth0)

If the browser sends a login token instead of a cookie, verify it in `getRef` on the server and pass it from the provider:

```jsx
<MonemeeProvider getHeaders={async () => ({ Authorization: `Bearer ${await auth.currentUser.getIdToken()}` })}>
```

Set the return URL to a page of your app (for example `/pro`) instead of `/monemee/return`. The provider redeems `?monemee_claim=...` on load and removes it from the address bar.

### 6. Test and go live

```bash
npx monemee test-buy                           # free test purchase while logged in
npx monemee live --url https://your-app.com    # return URL, live secret, webhook
```

Put the values that `live` prints into the production environment. `MONEMEE_WEBHOOK_SECRET` enables `/monemee/webhook`, so refunds take effect immediately instead of after the five-minute cache.

## How it works

`BuyButton` asks `/monemee/buy-url` for the checkout link with the logged-in user attached (falling back to the `/monemee/buy` redirect). After payment, Monemee sends the buyer to `/monemee/return?monemee_claim=...`. The server redeems the one-time token with the app secret, binds the license to the user and redirects to `successPath`. `requireAccess()` and `/monemee/access` then report access until a refund or expiry. The app secret stays on the server; the React package only talks to your routes.

## FAQ
{% for item in page.faq %}
### {{ item.q }}

{{ item.a }}
{% endfor %}

## Next steps

- [Web apps reference]({{ '/web-apps/' | relative_url }})
- [Runnable Express and React template](https://github.com/monemee/monemee-sdk/tree/main/templates/express-react)
- [Test the purchase flow without paying]({{ '/guides/test-purchase-flow/' | relative_url }})
- [All guides]({{ '/guides/' | relative_url }})
