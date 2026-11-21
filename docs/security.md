---
title: Security of the Monemee SDK
description: How app secrets, return tokens, webhook signatures and Ed25519-signed license responses protect your app and your buyers.
permalink: /security/
updated: 2026-11-22
---

# Security

| Mechanism | Protection |
|---|---|
| App secret (`mmapp_...`) | Server only; can check and unlock access for exactly one product; separate test and live secrets |
| Return token (`mmc_...`) | Single use, expires after 30 minutes, redeemable only with your app secret |
| License binding | A redeemed license belongs to one user; forwarded links and keys do not unlock other accounts |
| Webhooks | HMAC-SHA256 signature in `Monemee-Signature`, rejected after five minutes |
| Offline licenses | Ed25519 signatures over the exact payload; public keys bundled and published at `/.well-known/monemee-license-keys.json` |
| Outages | `requireAccess` fails closed with HTTP 503 |

Report vulnerabilities privately to info@monemee.com with the subject "Security". We respond within 72 hours. Details in [SECURITY.md](https://github.com/monemee/monemee-sdk/blob/main/SECURITY.md).
