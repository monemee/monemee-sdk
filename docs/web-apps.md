---
title: Add a paywall to Express, Next.js and React apps
description: Sell access to your Express, Next.js or React app. Hosted checkout, automatic unlock after payment and server-side access checks without a database column.
permalink: /web-apps/
updated: 2026-11-22
---

# Add a paywall to your web app

<p class="lead">Monemee binds each purchase to the user ID of your existing login. Your server asks whether that user has access; Monemee takes care of checkout, refunds and expiry.</p>

## 1. Set up the project

```bash
npx monemee init
```

This creates a product in test mode, writes `MONEMEE_APP_SECRET` and `MONEMEE_PRODUCT_ID` to `.env` and adds the integration to your server. Prefer to do it by hand? Install `monemee-node` and create a test secret in the dashboard under *License keys > App connection*.

## 2. Express

```js
const monemee = require('monemee-node')({
  getRef: (req) => req.user?.id,                       // stable user ID from your login
  loginUrl: (back) => `/login?next=${encodeURIComponent(back)}`
});

app.use(monemee.webhook());       // before express.json(): needs the raw body
app.use(express.json());
app.use(session(/* your login */));
app.use(monemee.routes());        // after your login

app.get('/api/pro', monemee.requireAccess(), (req, res) => {
  res.json({ plan: req.monemee.plan });
});
```

`requireAccess()` answers `401` when nobody is logged in and `402` with a `buy_url` when the user has not bought yet.

Step by step: [Express and React paywall guide]({{ '/guides/express-react-paywall/' | relative_url }}).

## 3. Next.js App Router

```js
// lib/monemee.js
import createMonemee from 'monemee-node';
import { auth } from '@/auth';
export const monemee = createMonemee({ getRef: async () => (await auth())?.user?.id });

// app/monemee/[...monemee]/route.js
export const { GET, POST } = monemee.nextRoute();

// app/api/pro/route.js
export async function GET(request) {
  const { response, access } = await monemee.guard(request);
  if (response) return response;
  return Response.json({ plan: access.plan });
}
```

Step by step, including server components: [Next.js paywall guide]({{ '/guides/nextjs-paywall/' | relative_url }}).

## 4. React paywall

```jsx
import { MonemeeProvider, AccessGate, BuyButton, LicenseForm } from 'monemee-react';

<MonemeeProvider>
  <AccessGate fallback={<><BuyButton>Unlock Pro</BuyButton><LicenseForm /></>}>
    <ProFeature />
  </AccessGate>
</MonemeeProvider>
```

### Firebase, Supabase or Auth0 login in the browser

When your frontend sends the login token as a header, pass it to the provider and set the return URL to a page of your app (for example `/pro`). The provider redeems the purchase on load.

```jsx
<MonemeeProvider getHeaders={async () => ({ Authorization: `Bearer ${await user.getIdToken()}` })}>
```

## 5. Test without paying

Start your app, log in and run:

```bash
npx monemee test-buy
```

The test purchase skips the payment step; everything from there on is real, including the return to your app and the unlock, with a test license. Test licenses are only visible to test secrets. More in [Test the purchase flow without paying]({{ '/guides/test-purchase-flow/' | relative_url }}).

## 6. Go live

```bash
npx monemee live --url https://your-app.com
```

This sets the return URL, creates a live secret and a webhook. Put the printed values into your production environment.

## Python web apps

Flask, FastAPI and Django use the [Python package](https://github.com/monemee/monemee-sdk/tree/main/packages/python): `App().has_access(user_id)`, `buy_url(user_id)` and `unlock(user_id, claim=...)`.

## Reference

- [monemee-node README](https://github.com/monemee/monemee-sdk/tree/main/packages/node)
- [monemee-react README](https://github.com/monemee/monemee-sdk/tree/main/packages/react)
- [Runnable Express and React template](https://github.com/monemee/monemee-sdk/tree/main/templates/express-react)
- [HTTP API (OpenAPI)](https://github.com/monemee/monemee-sdk/blob/main/openapi.yaml)
