---
title: "monemee CLI: sell your app in one command"
description: npx monemee init detects your framework, logs you in, creates the product, writes .env and wires up checkout and access checks. Plus test purchases and going live.
permalink: /cli/
updated: 2026-11-22
---

# The monemee CLI

<p class="lead">One command sets up selling your app: <code>npx monemee init</code>. No API key to copy, no dependencies, Node.js 18.17 or newer.</p>

## Commands

| Command | What it does |
|---|---|
| `npx monemee init` | Detects your project, logs you in, creates or picks a product, writes a test secret to `.env`, adds `.env` to `.gitignore` and wires Monemee into your code |
| `npx monemee test-buy` | Runs a free test purchase through the real flow |
| `npx monemee live` | Sets the return URL, creates a live secret and a webhook for production |
| `npx monemee doctor` | Checks `.env`, secret, product and return URL |
| `npx monemee login` / `logout` / `whoami` | Manages the browser login |

## What init changes in your project

- **Express:** creates the Monemee instance after `express()`, adds `app.use(monemee.webhook())` before your body parser and `app.use(monemee.routes())` before your first route. If the server file is ambiguous, it prints the snippet instead of editing.
- **Next.js:** adds `lib/monemee.js` and `app/monemee/[...monemee]/route.js`.
- **React:** adds `src/components/MonemeeUpgrade.jsx` with a paywall, a test purchase button and a license key form.

## Options

| Option | |
|---|---|
| `--yes` | Accept defaults (CI, AI assistants) |
| `--product <id>` | Use an existing product |
| `--title`, `--price` | Create a new product without prompts |
| `--url <https://...>` | Production address for `live` |
| `--ref <id>` | User ID for `test-buy` |
| `--skip-install` | Print the install command instead of running it |

The login is stored in `~/.config/monemee/credentials.json`, readable only by your user. Revoke it any time in Monemee under *Settings > Connected apps*.
