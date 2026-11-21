# Browser extension

`license.js` uses `chrome.storage` for persistence. Your `manifest.json` needs:

```json
{ "permissions": ["storage"], "host_permissions": ["https://monemee.com/*"] }
```

Popup: a key field that calls `license.activate(key)`. After that, use `await isPro()` anywhere.
