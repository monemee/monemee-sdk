---
title: "Sell your app: license keys, paywall and checkout"
description: The Monemee SDK adds a hosted checkout, unlocks buyers inside your app after payment and validates license keys with offline support. Set up in one command.
permalink: /
alternate: /de/
alternate_lang: de
updated: 2026-11-22
---

# Sell your app with license keys, a paywall and checkout

<p class="lead">The Monemee SDK turns an app you built into a product people can buy. It adds a hosted checkout, unlocks the buyer inside your app right after payment and validates license keys for desktop software, offline included.</p>

```bash
npx monemee init
```

<a class="cta" href="{{ '/web-apps/' | relative_url }}">Add a paywall to a web app</a>

The CLI logs you in through the browser, creates the product, writes your `.env` and wires Monemee into your code. Everything starts in test mode, so you can run the full purchase flow without real money.

## Choose your path

| Your app | Guide | Package |
|---|---|---|
| Web app with login (Express, Next.js, React) | [Add a paywall](web-apps/) | `monemee-node`, `monemee-react` |
| Desktop or downloadable software (Electron, Tauri, extensions, CLIs) | [Validate license keys](license-keys/) | `monemee-client` |
| Python tool or Flask, FastAPI, Django app | [Python](license-keys/#python) | `monemee` on PyPI |
| Releases from GitHub | [Deliver updates](github-action/) | GitHub Action |

Step-by-step [guides](guides/) cover [Next.js](guides/nextjs-paywall/), [Express and React](guides/express-react-paywall/), [Electron](guides/electron-license-key/), [Tauri](guides/tauri-license-key/), [Chrome extensions](guides/chrome-extension-license-key/), [Python](guides/python-license-key/) and [testing without paying](guides/test-purchase-flow/).

## What Monemee handles for you

- **Checkout and payments.** A buy link per product; card payments run through Stripe.
- **Unlock after purchase.** Buyers return to your app already unlocked, without copying a key.
- **License keys.** Generation, delivery by email, device limits, expiry dates and plan names.
- **Refunds.** A refund revokes access automatically, instantly with webhooks.
- **Offline licensing.** Responses are signed with Ed25519, so apps keep working without a connection.
- **Updates.** New releases reach existing buyers through the download links they already have.

## How a purchase works

1. Your app links to the checkout with the current user attached.
2. The buyer pays. Monemee issues a license and redirects back with a one-time token.
3. Your server redeems the token with its app secret, binding the license to that user.
4. From then on `hasAccess(userId)` returns `true` until a refund or expiry.

## Pricing

The SDK is free and MIT licensed. Monemee charges a fee per sale that drops from 29% to 9% as your revenue grows. There is no monthly fee.
