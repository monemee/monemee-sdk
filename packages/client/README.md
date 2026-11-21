# @monemee/client

License key validation for desktop and downloadable software: Electron, Tauri, browser extensions and Node CLIs. Activate a key once, then keep working offline thanks to responses signed with Ed25519. No dependencies.

[Monemee SDK](https://github.com/monemee/monemee-sdk) · [Deutsch](https://github.com/monemee/monemee-sdk/blob/main/README.de.md) · [Documentation](https://dev.monemee.com)

```bash
npm install @monemee/client
```

```js
import { createLicense } from '@monemee/client';

const license = createLicense({ productId: 123 });

// First start: ask for the key from the purchase email
const result = await license.activate(keyFromUser);
if (!result.valid) showError(result.reason);   // for example 'activation_limit'

// Every start
const { valid, plan, offline } = await license.check();
if (valid) startPro(plan);
```

## How `check()` works

1. It asks Monemee whether the key is valid on this device.
2. It verifies the signature of the answer and stores it.
3. Without a connection, the last valid answer counts for `graceDays` more days (default 7, reported as `offline: true`).

When a buyer is refunded, the next online check returns `reason: 'revoked'`. Tampered, expired or foreign responses are rejected.

## Options

| Option | Default | |
|---|---|---|
| `productId` | – | Your Monemee product ID |
| `graceDays` | `7` | How long the app keeps working offline |
| `storage` | `localStorage`, or a file in `~/.config/monemee-<id>/` on Node | Custom storage `{ get, set, remove }`, for example `chrome.storage` |
| `deviceName` | – | Shown in the device list of your dashboard |
| `baseUrl` | `https://monemee.com` | |

**Moving to a new computer:** `await license.deactivate()` frees the device slot. Set the device limit on the product.

**Testing:** the dashboard issues test keys under *License keys > Test key*. They are valid for 30 days and need no purchase.

**Requirements:** WebCrypto with Ed25519 (Node 20+, Electron 28+, current browsers). Where it is missing, online checks still work, but there is no offline grace period.

Python apps use the [monemee Python package](../python), which works the same way.

MIT License
