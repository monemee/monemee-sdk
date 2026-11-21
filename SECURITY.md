# Sicherheit

## Wie die Pakete dich schützen

- **App-Secret (`mmapp_…`)** liegt nur auf deinem Server. Es darf ausschließlich Zugang prüfen und freischalten, und zwar für genau ein Produkt. Test-Secrets sehen nur Testkäufe.
- **Rücksprung-Token (`mmc_…`)** sind 30 Minuten gültig und nur einmal einlösbar. Eingelöst werden sie nur mit deinem App-Secret.
- **Bindung:** Eine eingelöste Lizenz gehört genau einem Nutzer deiner App. Wer einen Link oder Schlüssel weitergibt, schaltet damit kein zweites Konto frei.
- **Webhooks** sind per HMAC-SHA256 signiert (`Monemee-Signature`), Anfragen älter als 5 Minuten werden abgelehnt.
- **Download-Software** prüft Ed25519-signierte Lizenzantworten. Der öffentliche Schlüssel steckt im Paket und liegt unter `https://monemee.com/.well-known/monemee-license-keys.json`.
- **Monemee nicht erreichbar:** `requireAccess` antwortet 503 und schaltet nicht still frei.

## Was du tun musst

- `.env` nie committen (`npx monemee init` trägt sie in `.gitignore` ein).
- Secret geleakt? Im Dashboard unter *Lizenzschlüssel → App-Anbindung* ein neues anlegen, ausrollen, das alte widerrufen.

## Lücke melden

Bitte nicht als öffentliches Issue, sondern an **info@monemee.com** (Betreff „Security“). Wir antworten innerhalb von 72 Stunden.
