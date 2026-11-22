---
title: "FAQ: license keys, paywalls and selling apps"
description: Answers about license key validation, offline licensing, paywalls for web apps, testing purchases, supported frameworks and pricing of the Monemee SDK.
permalink: /faq/
updated: 2026-11-22
faq:
  - q: How do I add license key validation to my app?
    a: Install monemee-client for JavaScript or monemee for Python, call activate(key) once and check() on every start. Monemee generates and emails the keys and handles device limits, expiry dates and refunds.
  - q: Does license validation work offline?
    a: Yes. Every response is signed with Ed25519. The SDK stores the last valid response and accepts it without a connection for a configurable grace period, seven days by default. Tampered or foreign responses are rejected.
  - q: Do I need my own database to track who paid?
    a: No. Purchases are bound to the user ID of your existing login. Your server calls hasAccess(userId), and the SDK caches the answer for five minutes.
  - q: How do I test the purchase flow without paying?
    a: npx monemee init creates a test secret. Run npx monemee test-buy or click the test purchase button in the paywall. Test licenses behave like real ones and are only visible in test mode.
  - q: Which frameworks are supported?
    a: Express and Next.js on the server, plus runtimes with Web-standard Request and Response such as Hono, Bun and Deno. React in the browser. Electron, Tauri, browser extensions and Node CLIs for downloadable software. Python with Flask, FastAPI and Django.
  - q: What happens when a buyer asks for a refund?
    a: The license is revoked. With webhooks your app learns about it immediately, otherwise within five minutes for web apps and on the next online check for desktop apps.
  - q: Can buyers share their license?
    a: A redeemed license belongs to exactly one user of your app, so a forwarded link or key does not unlock a second account. For desktop software you set a device limit per key.
  - q: What does it cost?
    a: The SDK is free and MIT licensed. Monemee charges a fee per sale that drops from 29% to 9% as your revenue grows. There is no monthly fee.
  - q: Can my AI coding assistant set this up?
    a: Yes. Tell Claude Code, Cursor or Copilot to sell the app with Monemee. They read AGENTS.md in the repository; ready-made skills for Claude Code and Cursor are included.
---

# Frequently asked questions

{% for item in page.faq %}
## {{ item.q }}

{{ item.a }}
{% endfor %}
