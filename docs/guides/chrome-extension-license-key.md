---
title: Sell a Chrome extension with license keys (Manifest V3)
description: Add paid features to a Manifest V3 Chrome extension. Activate a license key in the popup, check it in the service worker and store it in chrome.storage.
permalink: /guides/chrome-extension-license-key/
updated: 2026-11-22
last_modified_at: 2026-11-22
faq:
  - q: Why do I need a storage adapter in a Manifest V3 extension?
    a: Service workers have no localStorage. Without a storage option monemee-client falls back to memory there, and the activation is lost whenever Chrome stops the worker. An adapter around chrome.storage.local keeps it, and the popup and the worker share the same data.
  - q: Which permissions does the extension need?
    a: storage for chrome.storage, alarms if you re-check periodically, and host_permissions for https://monemee.com/* so the extension can call the license API.
  - q: Can I use monemee-client without a bundler?
    a: Not directly. Extensions cannot resolve npm package names, so bundle the service worker and the popup script with the bundler you already use. The package has no dependencies, so the output stays small.
---

# Sell a Chrome extension with license keys

<p class="lead">To sell a Manifest V3 Chrome extension, bundle <code>monemee-client</code> into the popup and the service worker and pass it a storage adapter around <code>chrome.storage.local</code>. The popup calls <code>activate(key)</code> once. The service worker calls <code>check()</code> on startup and on an alarm and saves the result for the rest of the extension.</p>

## Prerequisites

- A Manifest V3 extension and a bundler that resolves npm packages.
- A current Chrome version (the SDK needs WebCrypto with Ed25519).
- A Monemee product with license keys enabled, its product ID, and a test key from the dashboard (*License keys > Test key*).

## Steps

### 1. Install the package

```bash
npm install monemee-client
```

### 2. Declare permissions in manifest.json

```json
{
  "manifest_version": 3,
  "name": "My Extension",
  "version": "1.0.0",
  "background": { "service_worker": "background.js", "type": "module" },
  "action": { "default_popup": "popup.html" },
  "permissions": ["storage", "alarms"],
  "host_permissions": ["https://monemee.com/*"]
}
```

`background.js` and `popup.js` are your bundled outputs.

### 3. Create the license with a chrome.storage adapter

`createLicense` accepts `storage: { get, set, remove }`. Each method receives a string key; `get` returns the stored string or `null`, and all three may return promises. This module is shared by the service worker and the popup:

```js
// src/license.js
import { createLicense } from 'monemee-client';

const prefix = 'monemee:';
const storage = {
  get: async (k) => (await chrome.storage.local.get(prefix + k))[prefix + k] ?? null,
  set: (k, v) => chrome.storage.local.set({ [prefix + k]: v }),
  remove: (k) => chrome.storage.local.remove(prefix + k)
};

export const license = createLicense({ productId: 123, storage, graceDays: 14 });

// Checks the license and saves a small status object for content scripts and pages
export async function refreshStatus() {
  const r = await license.check();
  const status = { valid: r.valid, plan: r.plan, reason: r.reason, offline: Boolean(r.offline) };
  await chrome.storage.local.set({ proStatus: status });
  return status;
}
```

### 4. Check in the service worker

```js
// src/background.js
import { refreshStatus } from './license.js';

function schedule() {
  chrome.alarms.create('license-check', { periodInMinutes: 720 }); // every 12 hours
}

chrome.runtime.onInstalled.addListener(() => { schedule(); refreshStatus(); });
chrome.runtime.onStartup.addListener(() => { schedule(); refreshStatus(); });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'license-check') refreshStatus();
});
```

`check()` does not throw on network errors. Offline it returns the last signed result with `offline: true` for up to `graceDays`.

### 5. Activate the key in the popup

```html
<!-- popup.html -->
<form id="activate">
  <input id="key" placeholder="MM-XXXX-XXXX-XXXX-XXXX" autocomplete="off" required>
  <button>Activate</button>
</form>
<p id="message" role="alert"></p>
<button id="buy" type="button">Buy a license</button>
<script type="module" src="popup.js"></script>
```

```js
// src/popup.js
import { license, refreshStatus } from './license.js';

const message = document.getElementById('message');

document.getElementById('activate').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const result = await license.activate(document.getElementById('key').value);
    if (!result.valid) { message.textContent = `Not activated: ${result.reason}`; return; }
    await refreshStatus();
    message.textContent = 'Pro is active.';
  } catch (err) {
    message.textContent = err.message; // wrong format or no connection
  }
});

document.getElementById('buy').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://monemee.com/p/123' });
});
```

### 6. Gate paid features

```js
const { proStatus } = await chrome.storage.local.get('proStatus');
if (proStatus?.valid) enableProFeatures();
```

Content scripts can read `chrome.storage.local` too, so they do not need to import the SDK.

## How it works

The popup and the service worker are separate contexts, but both read and write the same `chrome.storage.local`, so a key activated in the popup is visible to the worker. The SDK stores the key with the last signed response under `monemee:state` and a random installation ID under `monemee:device`. Each online check replaces the stored response; offline, the SDK accepts it only if the Ed25519 signature, key hash, product, device and issue time match. A refund makes the next online check return `reason: 'revoked'`.

Like any check that runs on the user's machine, this one can be patched out by someone who edits the extension code. It stops casual sharing: each key works on a limited number of devices, which you set on the product.

## FAQ
{% for item in page.faq %}
### {{ item.q }}

{{ item.a }}
{% endfor %}

## Next steps

- [License keys reference]({{ '/license-keys/' | relative_url }}): reasons, offline rules, device limits
- [Test the purchase flow without paying]({{ '/guides/test-purchase-flow/' | relative_url }})
- [Electron license keys]({{ '/guides/electron-license-key/' | relative_url }})
- [All guides]({{ '/guides/' | relative_url }})
