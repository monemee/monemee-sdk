---
title: License key validation for Electron, Tauri and Python apps
description: Add license key activation and validation to desktop software, browser extensions and CLIs. Device limits, expiry and offline mode with Ed25519-signed responses.
permalink: /license-keys/
updated: 2026-11-22
---

# License key validation for desktop and downloadable software

<p class="lead">Buyers get a license key by email. Your app activates it once per device and checks it on every start. Signed responses keep the app working offline for a grace period.</p>

## How it works

1. You enable license keys on your Monemee product and choose a device limit, a duration (optional) and a plan name (optional).
2. After each purchase Monemee generates a key such as `MM-A7K2-9FQ3-XT8M-2B4C` and emails it to the buyer.
3. Your app calls `activate(key)` once. The key is bound to the device.
4. On every start your app calls `check()`. Monemee answers with a signed response that the SDK verifies and stores.
5. Without a connection the last valid response counts for `graceDays` (default: 7).

## JavaScript: Electron, Tauri, browser extensions, Node CLIs

```bash
npm install monemee-client
```

```js
import { createLicense } from 'monemee-client';

const license = createLicense({ productId: 123, graceDays: 7 });

const result = await license.activate(keyFromUser);
if (!result.valid) console.log(result.reason);    // e.g. 'activation_limit'

const { valid, plan, offline } = await license.check();
```

In Electron, run the license code in the main process and expose it to the renderer through a preload script. In Chrome extensions, pass `chrome.storage` as storage. Both are shown in the [examples](https://github.com/monemee/monemee-sdk/tree/main/examples).

## Python

```bash
pip install "monemee[offline]"
```

```python
from monemee import License

lic = License(product_id=123)
lic.activate("MM-XXXX-XXXX-XXXX-XXXX")   # once
if lic.check().valid:                     # on every start
    run_pro()
```

## Offline license verification

Every response from `/licenses/validate` and `/licenses/activate` includes a `signed` object. The signature is Ed25519 over the exact `payload` string, which contains a SHA-256 hash of the key, the product, the device, the plan, the expiry date and the issue time. The SDK accepts a stored response offline only if:

- the signature matches a Monemee public key,
- the key hash, product and device match,
- it was issued within the grace period,
- the license has not expired.

The public keys are bundled with the SDKs and published at `https://monemee.com/.well-known/monemee-license-keys.json`.

## Reasons a key is not valid

| `reason` | Meaning |
|---|---|
| `not_found` | The key does not exist for this product |
| `revoked` | Revoked, for example after a refund |
| `expired` | The license duration has ended |
| `activation_limit` | The device limit is reached; the buyer can free a device with `deactivate()` |
| `device_not_activated` | The key is valid but not activated on this device |
| `offline` | No connection and no valid stored response |

## Testing

The dashboard issues test keys under *License keys > Test key*. They are valid for 30 days, behave like real keys and are marked with `test: true`.
