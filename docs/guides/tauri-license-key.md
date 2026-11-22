---
title: Add license key validation to a Tauri app
description: Add license keys to a Tauri app with monemee-client in the webview. Storage adapter for the store plugin, CSP settings and offline grace period.
permalink: /guides/tauri-license-key/
updated: 2026-11-22
last_modified_at: 2026-11-22
faq:
  - q: Does monemee-client run in Rust or in the Tauri webview?
    a: In the webview. It is a JavaScript package that uses the webview's fetch and WebCrypto. The Rust side only needs the store plugin if you use the storage adapter from this guide.
  - q: Do I need a storage adapter in Tauri?
    a: No, the webview has localStorage and the SDK uses it by default. An adapter around the store plugin keeps the license in a file in the app data folder, independent of the webview's browsing data.
  - q: Why does the license check fail with my Content Security Policy?
    a: The webview calls https://monemee.com directly. If your tauri.conf.json sets a CSP, add https://monemee.com to connect-src. The license endpoints allow requests from any origin.
---

# Add license key validation to a Tauri app

<p class="lead">To add license keys to a Tauri app, install <code>monemee-client</code> in the frontend, create the license in the webview with a storage adapter around the store plugin, call <code>activate(key)</code> once and <code>check()</code> when the app starts. Signed responses keep the app unlocked offline for <code>graceDays</code>, seven days by default.</p>

## Prerequisites

- A Tauri 2 app with a JavaScript frontend.
- A webview with WebCrypto Ed25519 on every target platform. Test on each operating system you ship to; where Ed25519 is missing, online checks return `reason: 'invalid_signature'`.
- A Monemee product with license keys enabled, its product ID, and a test key from the dashboard (*License keys > Test key*).

## What runs where

| Part | Runs in | Does |
|---|---|---|
| `monemee-client` | Webview (your frontend) | Calls the license API, verifies signatures, decides `valid` |
| Store plugin, JavaScript side | Webview | Exposes `get`, `set`, `delete`, `save` |
| Store plugin, Rust side | Core process | Writes the file in the app data folder |

## Steps

### 1. Install the packages

```bash
npm install monemee-client
npm run tauri add store
```

`tauri add store` installs the JavaScript and Rust parts of the store plugin, registers it and adds the `store:default` permission to your capabilities.

### 2. Allow the license API in the CSP

If `app.security.csp` in `tauri.conf.json` is set, add Monemee to `connect-src`:

```json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; connect-src 'self' ipc: http://ipc.localhost https://monemee.com"
    }
  }
}
```

### 3. Create the license with a store adapter

`createLicense` accepts `storage: { get, set, remove }`; `get` returns a string or `null`, and all three may return promises.

```js
// src/license.js
import { createLicense } from 'monemee-client';
import { load } from '@tauri-apps/plugin-store';

const storePromise = load('license.json', { autoSave: false });

const storage = {
  get: async (k) => (await (await storePromise).get(k)) ?? null,
  set: async (k, v) => { const s = await storePromise; await s.set(k, v); await s.save(); },
  remove: async (k) => { const s = await storePromise; await s.delete(k); await s.save(); }
};

export const license = createLicense({ productId: 123, storage, graceDays: 7 });
```

Without the `storage` option the SDK uses the webview's `localStorage` under the prefix `monemee-<productId>:`.

### 4. Check on start

```js
// src/main.js
import { license } from './license.js';

const result = await license.check();
if (result.valid) {
  showApp({ plan: result.plan, offline: Boolean(result.offline) });
} else if (result.reason === 'offline') {
  showMessage('Connect to the internet once to confirm your license.');
} else {
  showActivation();
}
```

`check()` does not throw on network errors. Offline it returns the stored signed result with `offline: true` for up to `graceDays`.

### 5. Activate the key

```js
async function onActivateSubmit(key) {
  try {
    const result = await license.activate(key);
    if (result.valid) return showApp({ plan: result.plan });
    showError(`Not activated: ${result.reason}`);   // for example 'activation_limit'
  } catch (err) {
    showError(err.message);                         // wrong format or no connection
  }
}
```

Link to your buy page, for example `https://monemee.com/p/123`, and open it in the system browser with the opener plugin.

### 6. Free a device

`await license.deactivate()` releases the device slot and deletes the stored state, so the buyer can activate the key on a new computer.

## How it works

`activate(key)` sends the key, the product ID and a random device ID to Monemee and stores the signed response through your adapter. `check()` validates online on every start and replaces the stored response. Without a connection it accepts the stored one only if the Ed25519 signature, key hash, product, device and issue time (within `graceDays`) match. A refund makes the next online check return `reason: 'revoked'` and removes the stored state. The device ID lives in the same storage, so moving from `localStorage` to the store plugin in a later version gives existing installations a new device ID.

## FAQ
{% for item in page.faq %}
### {{ item.q }}

{{ item.a }}
{% endfor %}

## Next steps

- [License keys reference]({{ '/license-keys/' | relative_url }})
- [Electron license keys]({{ '/guides/electron-license-key/' | relative_url }})
- [Ship new versions from GitHub Releases]({{ '/github-action/' | relative_url }})
- [All guides]({{ '/guides/' | relative_url }})
