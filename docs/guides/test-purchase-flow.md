---
title: Test the purchase flow without paying
description: Run the full Monemee purchase flow for free with a test secret, npx monemee test-buy and test license keys, then go live with npx monemee live.
permalink: /guides/test-purchase-flow/
updated: 2026-11-22
last_modified_at: 2026-11-22
faq:
  - q: Do test purchases cost anything?
    a: No. A test purchase issues a test license without a payment. It is redeemed through the same return route and access checks as a real purchase.
  - q: Why does my test license not work in production?
    a: Test licenses are only visible to test secrets (mmapp_test_...), and live licenses only to live secrets. A mixed-up key or token returns the reason mode_mismatch.
  - q: How do I test license keys for desktop software?
    a: Create a test key in the dashboard under License keys > Test key. It is valid for 30 days, needs no purchase, behaves like a real key and comes back with test set to true.
---

# Test the purchase flow without paying

<p class="lead">To test a Monemee purchase without paying, use a test secret (<code>mmapp_test_...</code>), which <code>npx monemee init</code> creates. Then run <code>npx monemee test-buy</code> while logged in to your app: it issues a free test license and sends you through the real return flow. For desktop software, use a test key from the dashboard. Go live with <code>npx monemee live</code>.</p>

## Prerequisites

- A web app wired up with `monemee-node` (and optionally `monemee-react`), or a desktop app using `monemee-client` or the Python package.
- Node.js 18.17 or newer for the CLI.

## Steps for web apps

### 1. Get a test secret

```bash
npx monemee init
```

`init` writes a test secret to `.env` as `MONEMEE_APP_SECRET=mmapp_test_...` together with `MONEMEE_PRODUCT_ID`. If a test secret for the same product is already there, it reuses it. You can also create one in the dashboard under *License keys > App connection*. In test mode `monemee.mode` is `'test'` and the `/monemee/test-buy` route is active; with a live secret that route answers 404.

### 2. Check the setup

```bash
npx monemee doctor
```

`doctor` checks that `.env` exists, that the secret has the right format and is accepted, that the product ID matches, that license keys are enabled on the product, whether a return URL is set, and that `.env` is listed in `.gitignore`.

### 3. Run a test purchase

Start your app, log in, then:

```bash
npx monemee test-buy
```

With a cookie login, this opens `http://localhost:<port>/monemee/test-buy`. The route takes the logged-in user, asks Monemee for a test license and redirects to `/monemee/return?monemee_claim=...`, which unlocks the user and redirects to `successPath`. With a token login, the CLI opens your app instead: click the test purchase button in the paywall.

The CLI guesses the port from your server file (3000 if it cannot tell). Override it with `--port`:

```bash
npx monemee test-buy --port 3001
```

To unlock a specific user without opening the app's route, pass the user ID. The CLI requests the test license directly and opens the return link:

```bash
npx monemee test-buy --ref user_42
```

The return route redeems the token for the user who is logged in when the link opens, so log in as that user first.

### 4. Or trigger it from your code

| Where | Call |
|---|---|
| React | `const { mode, testBuy } = useAccess();` then `testBuy()` when `mode === 'test'` |
| Node.js | `await monemee.testBuyUrl(userId, { returnUrl })` returns the return link with the token |
| Python | `monemee.test_buy_url(user_id, "http://localhost:5000/monemee/return")` |
| HTTP | `POST /api/v1/apps/test-claim` with `{ "ref": "...", "return_url": "..." }` and the test secret as bearer token |

The return URL must point to `localhost` or to the domain of the product's return URL. With a live secret these calls fail.

### 5. Check access

After the test purchase, `hasAccess(userId)` returns `true`, `requireAccess()` lets the request through and `req.monemee.test` is `true`. In React, `AccessGate` renders its children.

## Steps for desktop software

Open the dashboard, go to *License keys > Test key* and create a key. Use it with `activate(key)` in `monemee-client` or the Python `License`. Test keys are valid for 30 days, need no purchase and return `test: true`.

## Going live

```bash
npx monemee live --url https://your-app.com
```

`live` asks where buyers should land after paying (default `/monemee/return`, or `/` for apps with a token login; set it with `--return-path`), saves that return URL on the product, creates a live secret and offers to create a webhook for `https://your-app.com/monemee/webhook`. It then prints, once:

```bash
MONEMEE_APP_SECRET=mmapp_live_...
MONEMEE_PRODUCT_ID=123
MONEMEE_WEBHOOK_SECRET=whsec_...   # only if you created the webhook
```

Put these values into your production environment, not into the repository. Keep the test secret in your local `.env`, so development stays in test mode. If the product is still a draft, `live` prints the link to publish it. Publish it before you share the buy link.

## How it works

Every app secret belongs to one product and one mode. A test secret sees only test licenses, a live secret only live ones, so test purchases never mix with real sales and a test token cannot unlock anything in production (`reason: 'mode_mismatch'`). A test purchase skips the payment step and issues a test license plus a one-time return token; from there your app runs exactly the code a real purchase runs.

Pricing for real sales: the SDK is free, and Monemee charges a fee per sale that drops from 29% to 9% as your revenue grows. There is no monthly fee.

## FAQ
{% for item in page.faq %}
### {{ item.q }}

{{ item.a }}
{% endfor %}

## Next steps

- [CLI reference]({{ '/cli/' | relative_url }})
- [Next.js paywall]({{ '/guides/nextjs-paywall/' | relative_url }})
- [Express and React paywall]({{ '/guides/express-react-paywall/' | relative_url }})
- [All guides]({{ '/guides/' | relative_url }})
