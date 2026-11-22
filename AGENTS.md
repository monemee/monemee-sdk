# AGENTS.md: instructions for AI coding assistants

Goal: sell the app in the current project through **Monemee**. Follow these steps in order and do not invent endpoints.

## 1. Pick the use case

- **Web app with its own login** (Express, Next.js, React SPA with a backend) → section A
- **Downloadable software** (Electron, Tauri, CLI, Python tool, browser extension, plugin) → section B
- Unsure? Ask the user whether buyers log in to the app.

## A. Web app

1. Run `npx monemee init` in the project folder. It opens the browser for login, so **ask the user to confirm the authorization**. It then creates the product, a test secret, `.env` entries and the code integration.
   - Without a browser or non-interactive: the user creates a test secret in the Monemee dashboard under *License keys > App connection* and adds it to `.env` as `MONEMEE_APP_SECRET`.
2. **Adjust `getRef`** (the CLI leaves a `TODO`). It must return the stable user ID of the logged-in user:
   - Passport or sessions: `(req) => req.user?.id`
   - Firebase token: verify the token from `req.headers.authorization` with the Admin SDK, return `uid`
   - Supabase: `(await supabase.auth.getUser(token)).data.user?.id`
   - Next.js with Auth.js: `async () => (await auth())?.user?.id`
   - Never use email addresses or names as the ref. They change and end up in URLs.
3. Order in Express:
   ```js
   app.use(monemee.webhook());   // right after express(), before express.json()
   app.use(express.json());
   // ... session / login ...
   app.use(monemee.routes());    // after the login, before your own routes
   ```
4. Protect paid features: on the server `monemee.requireAccess()` (Express) or `await monemee.guard(request)` (Web/Next.js); in the frontend `<AccessGate fallback={<BuyButton />}>` from `monemee-react`.
5. **Browser token login** (Firebase, Supabase, Auth0 SPA): `<MonemeeProvider getHeaders={...}>` with the login token. The return URL then points to a page of the app, not to `/monemee/return`.
6. Test: start the app, log in, run `npx monemee test-buy` or click the test purchase button in the paywall.
7. Go live only when the user asks: `npx monemee live --url https://...`. The printed values belong in the production environment variables, **never in the repository**.

## B. Downloadable software

1. Create a product with license keys enabled in Monemee (dashboard or MCP tool `create_software_product`) and note the `product_id`.
2. JavaScript, Electron, Tauri, extensions: `monemee-client`. Python: `pip install "monemee[offline]"`.
   ```js
   const license = createLicense({ productId: 123 });
   await license.activate(keyFromUser);          // once
   const { valid } = await license.check();      // on every start; offline up to graceDays
   ```
3. For testing, the dashboard issues a test key (*License keys > Test key*).
4. New versions: GitHub Action `monemee/monemee-sdk/action@v1`.

## Rules

- Secrets (`mmapp_...`, `whsec_...`, `monemee_...`) only in `.env` or environment variables. Make sure `.env` is in `.gitignore`.
- Nothing starting with `mmapp_` in frontend code.
- Do not build your own payment or license logic. The packages handle it.
- Reason codes: `no_license`, `revoked` (refund), `expired`, `ref_mismatch` (license belongs to another account), `mode_mismatch` (test vs. live).
- Docs: package READMEs; HTTP API: `openapi.yaml`.
