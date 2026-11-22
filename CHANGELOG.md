# Changelog

All notable changes to the Monemee SDK packages. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the packages use [Semantic Versioning](https://semver.org/).

## [0.1.1] - 2026-11-22

### Fixed
- `monemee-client` and Python `License`: when the runtime cannot verify Ed25519 at all (no WebCrypto Ed25519, or `cryptography` not installed), a signed online answer no longer turns into `invalid_signature`. The online answer counts (TLS), but it is not stored as an offline proof, so there is no offline grace. A signature that can be checked and is wrong is still rejected.
- `monemee-node`: `guard(request)` returns `{ response }` with a 503 JSON response when Monemee is unreachable instead of throwing, like `requireAccess()` (fail closed).
- `monemee-node`: `createMonemee()` no longer throws when `MONEMEE_APP_SECRET` is missing or invalid, so `next build` works without a `.env`. The built-in routes, `requireAccess()` and `guard()` answer 503 with `monemee_not_configured`; direct calls such as `hasAccess()` throw an error naming the variable.
- `monemee` CLI: the Express patch adds `try { process.loadEnvFile(); } catch {}` at the top of the server file, so `.env` is actually loaded (Node.js 20.12+; skipped if the file already uses `dotenv` or `loadEnvFile`).

### Changed
- `monemee` CLI: `live` also subscribes the webhook to `sale.completed`.
- `monemee-client`: on Windows under Node the license file is stored in `%APPDATA%\monemee-<id>\`, like the Python package. Other platforms are unchanged.
- `monemee-client`: new export `ed25519Supported()`.
- Docs: CLI flags `--port` and `--return-path`, reasons `not_activated` and `invalid_signature`, CommonJS/Electron note for `monemee-client`, clearer wording that a test purchase skips only the payment step, and an animated `npx monemee init` demo in the README.

## [0.1.0] - 2026-11-22

### Added
- `monemee` CLI: `init`, `test-buy`, `live`, `doctor`, `login`, `logout`, `whoami`
- `monemee-node`: access checks for web apps (Express, Next.js, Web-standard runtimes), webhooks, test purchases
- `monemee-react`: `MonemeeProvider`, `AccessGate`, `BuyButton`, `LicenseForm`, `useAccess`
- `monemee-client`: license keys for downloadable software, offline with signed responses
- `monemee` (Python): license keys and web access for Python
- GitHub Action: upload release files as new product versions
- `monemee` CLI and `monemee-react` components are available in English and German. The CLI picks the language from `--lang en|de`, `MONEMEE_LANG` or the system locale; `MonemeeProvider` takes `locale` and `messages` props. English is the default. Code that the CLI writes into your project is always English.
