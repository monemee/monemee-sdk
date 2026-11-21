---
name: monemee-sell
description: Use when the user wants to sell or monetize the app in the current project, add a paywall, or add license key validation with Monemee ("sell this app", "add a paywall", "check license keys", "unlock the pro version", "verkauf diese App über Monemee"). Sets up the Monemee SDK (CLI, @monemee/node, @monemee/react, @monemee/client, Python) correctly.
---

# Sell an app with Monemee

Read `AGENTS.md` from https://github.com/monemee/monemee-sdk if it is not in the project. Short version:

## 1. Pick the use case
- Buyers log in to the app: **web app** (step 2).
- The app is downloaded (Electron, Tauri, CLI, Python tool, extension): **license keys** (step 3).

## 2. Web app
1. Run `npx monemee init` in the project. The browser opens: **tell the user to confirm the authorization** and wait.
2. Replace the `TODO` at `getRef` with the real user ID of the login (session `req.user.id`, Firebase `uid` from the verified token, Supabase `user.id`). Never use the email address.
3. Check the order: `app.use(monemee.webhook())` before `express.json()`, `app.use(monemee.routes())` after the login and before your own routes.
4. Protect paid endpoints with `monemee.requireAccess()`, in the frontend use `<AccessGate fallback={<BuyButton />}>`.
5. Browser token login: `<MonemeeProvider getHeaders={async () => ({ Authorization: 'Bearer ' + token })}>`.
6. Let the user test: start the app, log in, test purchase (`npx monemee test-buy` or the button in the paywall).
7. `npx monemee live` **only when the user explicitly asks**. Never commit the printed secrets.

## 3. Downloadable software
- JavaScript: `npm i @monemee/client`, then `createLicense({ productId })`, `activate(key)` once, `check()` on every start.
- Python: `pip install "monemee[offline]"`, then `License(product_id=...)`.
- Product ID: from the dashboard or the MCP tool `create_software_product`.
- Releases: add a workflow with `monemee/monemee-sdk/action@v1`.

## Never
- Put secrets (`mmapp_`, `whsec_`, `monemee_`) in the repository or in frontend code.
- Build your own payment or license logic.
- Go live without asking.
