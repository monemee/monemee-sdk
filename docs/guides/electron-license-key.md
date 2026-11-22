---
title: Add license key validation to an Electron app
description: Activate a license key once, check it on every start and keep working offline in Electron. Runs in the main process with monemee-client.
permalink: /guides/electron-license-key/
updated: 2026-11-22
last_modified_at: 2026-11-22
faq:
  - q: Should license checks run in the Electron main process or the renderer?
    a: In the main process. It has file system access for the license state, it is not reloaded with the window, and the renderer only needs three functions exposed through a preload script with contextBridge.
  - q: Where does monemee-client store the license in Electron?
    a: Wherever the storage option points. Without it, the main process writes to ~/.config/monemee-<productId>/license.json (%APPDATA%\monemee-<productId>\license.json on Windows). Passing a small adapter that writes to app.getPath('userData') keeps the file next to your other app data.
  - q: What happens when the user is offline?
    a: check() verifies the last signed response stored on disk and returns valid with offline set to true for up to graceDays, seven by default. After that it returns reason offline until the app can reach Monemee again.
---

# Add license key validation to an Electron app

<p class="lead">To add license keys to an Electron app, install <code>monemee-client</code>, create the license in the main process with a storage adapter in <code>app.getPath('userData')</code>, call <code>activate(key)</code> once from an activation window and <code>check()</code> on every start. Signed responses keep the app unlocked offline for <code>graceDays</code>, seven days by default.</p>

## Prerequisites

- Electron 28 or newer (the SDK needs WebCrypto with Ed25519).
- A Monemee product with license keys enabled, and its product ID. Buyers get a key such as `MM-A7K2-9FQ3-XT8M-2B4C` by email after each purchase.
- A test key from the dashboard under *License keys > Test key*, so you can try everything without buying.

## Steps

### 1. Install the package

```bash
npm install monemee-client
```

`monemee-client` is an ES module. Use an ES module main process (`main.mjs`, or `"type": "module"` in `package.json`). From a CommonJS main process, load it with `await import('monemee-client')`.

### 2. Create the license in the main process

The `storage` option takes any object with `get`, `set` and `remove`; the methods may return promises. This adapter keeps the license state in the app's `userData` folder:

```js
// license.mjs (main process)
import { app } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLicense } from 'monemee-client';

const file = () => path.join(app.getPath('userData'), 'license.json');

async function readAll() {
  try { return JSON.parse(await fs.readFile(file(), 'utf8')); } catch { return {}; }
}
async function writeAll(data) {
  await fs.mkdir(path.dirname(file()), { recursive: true });
  await fs.writeFile(file(), JSON.stringify(data), { mode: 0o600 });
}

const storage = {
  get: async (k) => (await readAll())[k] ?? null,
  set: async (k, v) => { const all = await readAll(); all[k] = v; await writeAll(all); },
  remove: async (k) => { const all = await readAll(); delete all[k]; await writeAll(all); }
};

export const license = createLicense({
  productId: 123,          // your product ID
  graceDays: 7,            // offline period
  deviceName: os.hostname(), // shown in the device list of your dashboard
  storage
});
```

The SDK stores three entries: `state` (the key and the last signed response), `device` (a random ID for this installation) and, after a key rotation, `keys`.

### 3. Expose activate, check and deactivate over IPC

`activate()` throws a `LicenseError` with `code: 'INVALID_KEY'` when the key has the wrong format, and it throws on network errors. Catch both in the main process so the renderer always gets a plain object.

```js
// main.mjs
import { app, BrowserWindow, ipcMain } from 'electron';
import { license } from './license.mjs';

ipcMain.handle('license:activate', async (_event, key) => {
  try {
    return await license.activate(String(key));
  } catch (err) {
    return { valid: false, reason: null, error: err.message };
  }
});
ipcMain.handle('license:check', () => license.check());
ipcMain.handle('license:deactivate', () => license.deactivate());
```

```js
// preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('license', {
  activate: (key) => ipcRenderer.invoke('license:activate', key),
  check: () => ipcRenderer.invoke('license:check'),
  deactivate: () => ipcRenderer.invoke('license:deactivate')
});
```

### 4. Check the license on every start

```js
// main.mjs (continued)
app.whenReady().then(async () => {
  const result = await license.check();
  const win = new BrowserWindow({
    webPreferences: { preload: new URL('./preload.cjs', import.meta.url).pathname }
  });
  win.loadFile(result.valid ? 'app.html' : 'activate.html');
});
```

`check()` returns `{ valid, reason, plan, expiresAt, test, offline }`. It does not throw on network errors: offline, it falls back to the stored signed response. Use `plan` if your product has several plans.

### 5. Build the activation window

```html
<!-- activate.html -->
<form id="activate">
  <input id="key" placeholder="MM-XXXX-XXXX-XXXX-XXXX" autocomplete="off" required>
  <button>Activate</button>
  <p id="message" role="alert"></p>
</form>
<script>
  document.getElementById('activate').addEventListener('submit', async (e) => {
    e.preventDefault();
    const result = await window.license.activate(document.getElementById('key').value);
    if (result.valid) location.href = 'app.html';
    else document.getElementById('message').textContent = result.error || `Not activated: ${result.reason}`;
  });
</script>
```

Link to your buy page from this window, for example `https://monemee.com/p/123`, and open it with `shell.openExternal` in the main process.

### 6. Let buyers move to a new computer

`license.deactivate()` frees the device slot on Monemee and deletes the stored state. Offer it in your settings, for example as "Deactivate this device".

## How it works

`activate(key)` sends the key, the product ID and the device ID to Monemee. If the device limit allows it, the key is bound to this device and the signed response is stored. `check()` asks Monemee on every start and stores each new signed response. Without a connection it accepts the stored response if the Ed25519 signature, the key hash, the product, the device and the issue time (within `graceDays`) all match. A refund turns the next online check into `reason: 'revoked'` and removes the stored state.

The device ID lives in the same storage. If you change the storage location in a later version, existing installations get a new device ID and use another activation slot, so pick the location once.

## FAQ
{% for item in page.faq %}
### {{ item.q }}

{{ item.a }}
{% endfor %}

## Next steps

- [License keys reference]({{ '/license-keys/' | relative_url }}): reasons a key is not valid, offline verification details
- [Ship new versions from GitHub Releases]({{ '/github-action/' | relative_url }})
- [Test the purchase flow without paying]({{ '/guides/test-purchase-flow/' | relative_url }})
- [All guides]({{ '/guides/' | relative_url }})
