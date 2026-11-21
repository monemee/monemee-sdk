# @monemee/client

Lizenzschlüssel für Software zum Herunterladen: Electron, Tauri, Browser-Erweiterungen, Node-CLIs. Einmal aktivieren, danach läuft die App auch **offline**, abgesichert durch Antworten, die Monemee signiert.

```bash
npm install @monemee/client
```

```js
import { createLicense } from '@monemee/client';

const license = createLicense({ productId: 123 });

// Beim ersten Start: Schlüssel aus der Kauf-Mail eingeben lassen
const result = await license.activate(keyFromUser);
if (!result.valid) showError(result.reason);   // z. B. 'activation_limit'

// Bei jedem Start
const { valid, plan, offline } = await license.check();
if (valid) startPro(plan);
```

## Was `check()` macht

1. fragt Monemee, ob der Schlüssel auf diesem Gerät gilt,
2. prüft die Signatur der Antwort und merkt sie sich,
3. ohne Netz gilt die letzte gültige Antwort noch `graceDays` Tage (Standard 7, dann `offline: true`).

Erstattet ein Käufer, ist der Schlüssel beim nächsten Online-Check ungültig (`reason: 'revoked'`).

## Optionen

| Option | Standard | |
|---|---|---|
| `productId` | – | deine Produkt-ID |
| `graceDays` | `7` | so lange läuft die App ohne Netz |
| `storage` | `localStorage` bzw. Datei in `~/.config/monemee-<id>/` | eigener Speicher `{ get, set, remove }` |
| `deviceName` | – | erscheint in deiner Geräteliste im Dashboard |

**Gerät wechseln:** `await license.deactivate()` gibt den Platz frei. Das Geräte-Limit stellst du am Produkt ein.

**Testen:** Im Dashboard unter *Lizenzschlüssel → Testschlüssel* bekommst du einen Schlüssel, der 30 Tage gilt, ohne Kauf.

**Voraussetzung:** WebCrypto mit Ed25519 (Node 20+, Electron 28+, aktuelle Browser). Wo das fehlt, funktioniert alles online, offline gibt es dann keinen Puffer.

MIT-Lizenz
