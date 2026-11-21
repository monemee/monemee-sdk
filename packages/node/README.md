# @monemee/node

Add a paywall to your Node.js web app and sell access through Monemee. Buyers pay on a hosted checkout, return to your app and are unlocked right away, without a database column of your own. Works with Express, Next.js and any runtime that uses Web-standard `Request` and `Response`.

[Monemee SDK](https://github.com/monemee/monemee-sdk) · [Deutsch](https://github.com/monemee/monemee-sdk/blob/main/README.de.md) · [Documentation](https://dev.monemee.com)

```bash
npx monemee init        # logs in, creates the product, writes .env, wires up your code
```

or manually:

```bash
npm install @monemee/node
```

## Express

```js
const express = require('express');
const monemee = require('@monemee/node')({
  getRef: (req) => req.user?.id,                         // user ID from your login
  loginUrl: (back) => `/login?next=${encodeURIComponent(back)}`
});

const app = express();
app.use(monemee.webhook());       // first: webhooks need the raw body
app.use(express.json());
app.use(session(/* ... */));      // your login
app.use(monemee.routes());        // after your login, so req.user is set

app.get('/api/pro-feature', monemee.requireAccess(), (req, res) => {
  res.json({ ok: true, plan: req.monemee.plan });
});
```

`.env`:

```bash
MONEMEE_APP_SECRET=mmapp_test_...    # Dashboard: License keys > App connection, or npx monemee init
MONEMEE_PRODUCT_ID=123
MONEMEE_WEBHOOK_SECRET=whsec_...     # optional, makes refunds take effect instantly
```

## Next.js (App Router)

```js
// lib/monemee.js
import createMonemee from '@monemee/node';
import { auth } from './auth';
export const monemee = createMonemee({ getRef: async () => (await auth())?.user?.id });

// app/monemee/[...monemee]/route.js
import { monemee } from '@/lib/monemee';
export const { GET, POST } = monemee.nextRoute();

// app/api/pro/route.js
export async function GET(request) {
  const { response, access } = await monemee.guard(request);
  if (response) return response;            // 401 or 402 with buy_url
  return Response.json({ plan: access.plan });
}
```

Hono, Bun and Deno: `await monemee.handleRequest(request)` returns a `Response` or `null`.

## Built-in routes

| Route | Purpose |
|---|---|
| `GET /monemee/buy` | Redirects to checkout with the logged-in user attached |
| `GET /monemee/return` | Return after purchase: unlocks, then redirects to `successPath` (`?monemee=unlocked`) |
| `GET /monemee/access` | `{ access, plan, expires_at, buy_url }` for your frontend ([@monemee/react](../react)) |
| `GET /monemee/buy-url` | The same as JSON, for apps that log in with a browser token |
| `POST /monemee/unlock` | `{ claim }` or `{ key }`: unlock from the browser or with a license key |
| `POST /monemee/webhook` | Applies refunds and revocations instantly (needs `MONEMEE_WEBHOOK_SECRET`) |
| `GET /monemee/test-buy` | Test secret only: free test purchase through the real flow |

## Without the routes

```js
await monemee.hasAccess(userId);              // true or false
await monemee.access(userId);                 // { access, reason, plan, expires_at }
await monemee.buyUrl(userId);                 // https://monemee.com/buy/123?ref=...
await monemee.unlock({ claim, ref: userId }); // redeem a return token
await monemee.unlock({ key, ref: userId });   // redeem a license key
```

## Options

| Option | Default | |
|---|---|---|
| `getRef(req)` | – | Stable user ID of the logged-in user. Never use email addresses. |
| `appSecret` | `MONEMEE_APP_SECRET` | `mmapp_test_...` or `mmapp_live_...` |
| `productId` | `MONEMEE_PRODUCT_ID` | Looked up automatically if missing |
| `basePath` | `/monemee` | Where the built-in routes live |
| `successPath` | `/` | Redirect target after unlocking |
| `loginUrl(back)` | – | Where to send buyers who return while logged out |
| `cacheSeconds` | `300` | How long access results are cached |
| `onEvent(event)` | – | Called for verified webhook events |

## Good to know

- **Test mode first.** A `mmapp_test_...` secret only sees test purchases. Switch to live with `npx monemee live`.
- **Caching.** Results are cached for five minutes. With webhooks a refund applies immediately, without them within five minutes.
- **Scope of the secret.** The app secret belongs on the server. It can only check and unlock access, for exactly one product.
- **No sharing.** A redeemed license is bound to one user and cannot unlock a second account.
- **Fail closed.** If Monemee is unreachable, `requireAccess` answers 503 instead of granting access.
- **TypeScript.** Type definitions are included.

MIT License
