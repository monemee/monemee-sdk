---
title: Add a paywall to a Next.js App Router app
description: Sell access to a Next.js App Router app. One catch-all route, guard() for API routes, hasAccess() in server components and AccessGate in the browser.
permalink: /guides/nextjs-paywall/
updated: 2026-11-22
last_modified_at: 2026-11-22
faq:
  - q: Do I need a database table to store who paid?
    a: No. Each purchase is bound to the user ID that getRef returns. Your server asks Monemee whether that user has access, and monemee-node caches the answer for five minutes.
  - q: What does monemee.guard(request) return?
    a: An object with response and access. When nobody is logged in, response is a 401 Response; when the user has not bought, it is a 402 Response with a buy_url. Otherwise response is null and access holds the plan and expiry date.
  - q: Why does the paywall component need 'use client'?
    a: monemee-react uses React context and hooks, which only run in client components. Put the MonemeeProvider in a file that starts with 'use client' and render it from your server component.
---

# Add a paywall to a Next.js App Router app

<p class="lead">To add a paywall to a Next.js App Router app, install <code>monemee-node</code> and <code>monemee-react</code>, create one Monemee instance whose <code>getRef</code> returns the logged-in user ID, export <code>nextRoute()</code> from a catch-all route, protect API routes with <code>guard(request)</code> and wrap paid UI in <code>AccessGate</code>. No database column is needed.</p>

## Prerequisites

- A Next.js app with the App Router and Node.js 18.17 or newer.
- A login that gives you a stable user ID. The examples use Auth.js (`auth()`); any auth library works.
- A Monemee account. `npx monemee init` creates the product and a test secret.

## Steps

### 1. Run the setup

```bash
npx monemee init
```

In a Next.js project this writes `MONEMEE_APP_SECRET` (a test secret, `mmapp_test_...`) and `MONEMEE_PRODUCT_ID` to `.env`, adds `.env` to `.gitignore`, creates `lib/monemee.js` (or `src/lib/monemee.js`) and `app/monemee/[...monemee]/route.js`, and offers to install `monemee-node monemee-react`.

By hand: `npm install monemee-node monemee-react`, create a test secret in the dashboard under *License keys > App connection* and put both values into `.env`.

### 2. Return the user ID in getRef

The generated `lib/monemee.js` contains `getRef: async (request) => null, // TODO`. Replace it with your login:

```js
// lib/monemee.js
import createMonemee from 'monemee-node';
import { auth } from '@/auth';

export const monemee = createMonemee({
  getRef: async () => (await auth())?.user?.id,
  successPath: '/pro' // where buyers land after the purchase
});
```

Use a stable ID, never an email address or a name. `createMonemee` throws when `MONEMEE_APP_SECRET` is missing or malformed, so set it in every environment that imports this file, including your build.

### 3. Add the catch-all route

```js
// app/monemee/[...monemee]/route.js
import { monemee } from '@/lib/monemee';

export const { GET, POST } = monemee.nextRoute();
```

This serves `/monemee/buy`, `/monemee/return`, `/monemee/access`, `/monemee/buy-url`, `/monemee/unlock`, `/monemee/webhook` and, with a test secret, `/monemee/test-buy`.

### 4. Protect API routes

```js
// app/api/pro/route.js
import { monemee } from '@/lib/monemee';

export async function GET(request) {
  const { response, access } = await monemee.guard(request);
  if (response) return response; // 401 login_required or 402 payment_required with buy_url
  return Response.json({ plan: access.plan });
}
```

### 5. Protect a server component

Server components have no `Request`, so ask with the user ID directly:

```jsx
// app/pro/page.jsx
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { monemee } from '@/lib/monemee';
import Paywall from './Paywall';

export default async function ProPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (!(await monemee.hasAccess(session.user.id))) return <Paywall />;
  return <h1>Pro</h1>;
}
```

### 6. Add the paywall in the browser

```jsx
// app/pro/Paywall.jsx
'use client';
import { MonemeeProvider, AccessGate, BuyButton, LicenseForm, useAccess } from 'monemee-react';

function Offer() {
  const { mode, testBuy } = useAccess();
  return (
    <div>
      <BuyButton>Unlock Pro</BuyButton>
      {mode === 'test' && <button type="button" onClick={() => testBuy()}>Test purchase</button>}
      <LicenseForm />
    </div>
  );
}

export default function Paywall() {
  return (
    <MonemeeProvider locale="en" onUnlocked={() => window.location.reload()}>
      <AccessGate fallback={<Offer />}>
        <p>Unlocked. Reloading...</p>
      </AccessGate>
    </MonemeeProvider>
  );
}
```

Set `locale` explicitly with server-side rendering so server and browser render the same default texts. `BuyButton` sends the buyer to the checkout with the current user attached. `LicenseForm` lets buyers who paid without the return flow paste the key from their purchase email.

### 7. Test and go live

```bash
npx monemee test-buy                           # opens http://localhost:3000/monemee/test-buy
npx monemee live --url https://your-app.com    # return URL, live secret, webhook
```

`live` sets the return URL to `https://your-app.com/monemee/return` by default and prints `MONEMEE_APP_SECRET`, `MONEMEE_PRODUCT_ID` and, if you accept the webhook, `MONEMEE_WEBHOOK_SECRET`. Put them into your hosting provider's environment variables, not into the repository.

## How it works

`BuyButton` links to `/monemee/buy`, which redirects to the Monemee checkout with `?ref=<user id>`. After payment Monemee redirects to `/monemee/return?monemee_claim=...`. The route redeems this one-time token with your app secret, binds the license to the logged-in user and redirects to `successPath` with `?monemee=unlocked`. From then on `hasAccess(userId)` and `guard(request)` return access until a refund or expiry. The app secret never leaves the server; the browser only talks to your `/monemee/*` routes.

## FAQ
{% for item in page.faq %}
### {{ item.q }}

{{ item.a }}
{% endfor %}

## Next steps

- [Web apps reference]({{ '/web-apps/' | relative_url }}): options, token login, Python web apps
- [Test the purchase flow without paying]({{ '/guides/test-purchase-flow/' | relative_url }})
- [Express and React paywall]({{ '/guides/express-react-paywall/' | relative_url }})
- [All guides]({{ '/guides/' | relative_url }})
