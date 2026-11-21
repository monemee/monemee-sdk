# Browser-Erweiterung

`license.js` nutzt `chrome.storage` als Speicher. Im `manifest.json` brauchst du:

```json
{ "permissions": ["storage"], "host_permissions": ["https://monemee.com/*"] }
```

Popup: Schlüssel-Feld → `license.activate(key)`. Danach überall `await isPro()`.
