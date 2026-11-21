# AGENTS.md – Anleitung für KI-Assistenten

Ziel: Die App im aktuellen Projekt über **Monemee** verkaufen. Halte dich an diese Reihenfolge und erfinde keine Endpunkte.

## 1. Fall bestimmen

- **Web-App mit eigenem Login** (Express, Next.js, Fastify, React-SPA mit Backend) → Abschnitt A
- **Software zum Herunterladen** (Electron, Tauri, CLI, Python-Tool, Browser-Erweiterung, Plugin) → Abschnitt B
- Unklar? Den Nutzer fragen, ob Käufer sich in der App einloggen.

## A. Web-App

1. Im Projektordner `npx monemee init` ausführen. Der Befehl öffnet den Browser zum Login, also **den Nutzer bitten, die Freigabe zu bestätigen**. Danach legt er Produkt, Test-Secret, `.env` und die Einbindung an.
   - Ohne Browser bzw. nicht interaktiv: Der Nutzer legt im Monemee-Dashboard unter *Lizenzschlüssel → App-Anbindung* ein Test-Secret an und trägt es als `MONEMEE_APP_SECRET` in die `.env` ein.
2. **`getRef` anpassen** (die CLI hinterlässt ein `TODO`). Es muss die stabile Nutzer-ID des eingeloggten Nutzers liefern:
   - Passport/Session: `(req) => req.user?.id`
   - Firebase-Token: Token aus `req.headers.authorization` mit dem Admin-SDK prüfen → `uid`
   - Supabase: `(await supabase.auth.getUser(token)).data.user?.id`
   - Next.js/Auth.js: `async () => (await auth())?.user?.id`
   - Niemals E-Mail-Adressen oder Namen als ref verwenden: Sie ändern sich und landen in URLs.
3. Reihenfolge in Express:
   ```js
   app.use(monemee.webhook());   // direkt nach express(), vor express.json()
   app.use(express.json());
   // … Session / Login …
   app.use(monemee.routes());    // nach dem Login, vor den eigenen Routen
   ```
4. Bezahlte Funktionen schützen: Server `monemee.requireAccess()` (Express) bzw. `await monemee.guard(request)` (Web/Next); Frontend `<AccessGate fallback={<BuyButton />}>` aus `@monemee/react`.
5. **Token-Login im Browser** (Firebase, Supabase, Auth0-SPA): `<MonemeeProvider getHeaders={…}>` mit dem Login-Token. Die Rücksprung-URL zeigt dann auf eine Seite der App, nicht auf `/monemee/return`.
6. Testen: App starten, einloggen, `npx monemee test-buy` oder in der Paywall „Testkauf (ohne Geld)“ klicken.
7. Live gehen (nur auf Wunsch des Nutzers): `npx monemee live --url https://…`. Die ausgegebenen Werte gehören in die Umgebungsvariablen des Produktivsystems, **nicht ins Repo**.

## B. Download-Software

1. Produkt mit aktivierten Lizenzschlüsseln in Monemee anlegen (Dashboard oder MCP-Tool `create_software_product`). Die `product_id` notieren.
2. JS/Electron/Tauri/Erweiterung: `@monemee/client`, Python: `pip install monemee`.
   ```js
   const license = createLicense({ productId: 123 });
   await license.activate(keyFromUser);          // einmal
   const { valid } = await license.check();      // bei jedem Start; offline bis graceDays
   ```
3. Für Tests liefert das Dashboard einen Testschlüssel (*Lizenzschlüssel → Testschlüssel*).
4. Neue Versionen: GitHub Action `monemee/monemee-dev/action@v1`.

## Regeln

- Secrets (`mmapp_…`, `whsec_…`, `monemee_…`) nur in `.env` bzw. Umgebungsvariablen. Prüfen, dass `.env` in `.gitignore` steht.
- Nichts ins Frontend, was mit `mmapp_` beginnt.
- Keine eigenen Kauf- oder Lizenzlogiken nachbauen. Die Pakete machen das.
- Fehlercodes: `no_license`, `revoked` (Erstattung), `expired`, `ref_mismatch` (Lizenz gehört einem anderen Konto), `mode_mismatch` (Test vs. Live).
- Doku: README der Pakete, API: `openapi.yaml`.
