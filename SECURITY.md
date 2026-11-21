# Security

## How the SDK protects you

- **App secret (`mmapp_...`)** stays on your server. It can only check and unlock access, for exactly one product. Test secrets only see test purchases.
- **Return tokens (`mmc_...`)** are valid for 30 minutes and can be redeemed once, only with your app secret.
- **Binding:** a redeemed license belongs to exactly one user of your app. Forwarding a link or key does not unlock a second account.
- **Webhooks** are signed with HMAC-SHA256 (`Monemee-Signature`). Requests older than five minutes are rejected.
- **Downloadable software** verifies Ed25519-signed license responses. The public key ships with the packages and is published at `https://monemee.com/.well-known/monemee-license-keys.json`.
- **Monemee unreachable:** `requireAccess` answers 503 and never grants access silently.

## What you need to do

- Never commit `.env` (`npx monemee init` adds it to `.gitignore`).
- Leaked secret? Create a new one in the dashboard under *License keys > App connection*, deploy it, then revoke the old one.

## Supported versions

Security fixes are released for the latest minor version of each package.

## Reporting a vulnerability

Please do not open a public issue. Email **info@monemee.com** with the subject "Security". We respond within 72 hours.
