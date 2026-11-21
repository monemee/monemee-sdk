---
name: monemee-sell
description: Use when the user wants to sell, monetize or add a paywall/license check to the app in the current project via Monemee ("verkauf diese App über Monemee", "Paywall einbauen", "Lizenzschlüssel prüfen", "Pro-Version freischalten"). Sets up the Monemee Dev-Kit (CLI, @monemee/node, @monemee/react, @monemee/client, Python) correctly.
---

# Mit Monemee verkaufen

Lies zuerst `AGENTS.md` aus https://github.com/monemee/monemee-dev, falls im Projekt nicht vorhanden. Die Kurzfassung:

## 1. Fall bestimmen
- Käufer loggen sich in der App ein → **Web-App** (Schritt 2).
- App wird heruntergeladen (Electron, Tauri, CLI, Python-Tool, Erweiterung) → **Lizenzschlüssel** (Schritt 3).

## 2. Web-App
1. `npx monemee init` im Projekt ausführen. Der Browser öffnet sich: **Sag dem Nutzer, dass er die Freigabe bestätigen soll**, und warte.
2. In der Einbindung das `TODO` bei `getRef` durch die echte Nutzer-ID des Logins ersetzen (Session `req.user.id`, Firebase-`uid` aus dem geprüften Token, Supabase-`user.id`). Keine E-Mail als ID verwenden.
3. Reihenfolge prüfen: `app.use(monemee.webhook())` vor `express.json()`, `app.use(monemee.routes())` nach dem Login, vor den eigenen Routen.
4. Bezahlte Endpunkte mit `monemee.requireAccess()` schützen, im Frontend `<AccessGate fallback={<BuyButton />}>`.
5. Token-Login im Browser → `<MonemeeProvider getHeaders={async () => ({ Authorization: 'Bearer ' + token })}>`.
6. Testen lassen: App starten, einloggen, Testkauf (`npx monemee test-buy` oder Knopf in der Paywall).
7. `npx monemee live` **nur auf ausdrücklichen Wunsch**. Ausgegebene Secrets nie committen.

## 3. Download-Software
- JS: `npm i @monemee/client` → `createLicense({ productId })`, `activate(key)` einmal, `check()` bei jedem Start.
- Python: `pip install "monemee[offline]"` → `License(product_id=…)`.
- Produkt-ID: aus dem Dashboard oder per MCP `create_software_product`.
- Releases: Workflow mit `monemee/monemee-dev/action@v1` anlegen.

## Niemals
- Secrets (`mmapp_`, `whsec_`, `monemee_`) ins Repo oder ins Frontend.
- Eigene Zahlungs- oder Lizenzlogik bauen.
- Ohne Rückfrage live schalten.
