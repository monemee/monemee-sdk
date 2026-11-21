# Monemee SDK: App verkaufen mit Lizenzschlüssel, Paywall und Bezahlseite

[![npm](https://img.shields.io/npm/v/monemee?label=npx%20monemee)](https://www.npmjs.com/package/monemee)
[![PyPI](https://img.shields.io/pypi/v/monemee?label=pypi)](https://pypi.org/project/monemee/)
[![Tests](https://github.com/monemee/monemee-sdk/actions/workflows/test.yml/badge.svg)](https://github.com/monemee/monemee-sdk/actions/workflows/test.yml)
[![Lizenz: MIT](https://img.shields.io/badge/lizenz-MIT-2340D0)](LICENSE)

[English](README.md) · **Deutsch** · [Dokumentation](https://dev.monemee.com) · [API-Referenz](openapi.yaml)

Mit dem Monemee SDK verkaufst du eine App, die du gebaut hast. Es bringt eine fertige Bezahlseite mit, schaltet Käufer direkt nach dem Kauf in deiner App frei und prüft Lizenzschlüssel für Desktop- und Download-Software, auch offline. Eingerichtet wird alles mit einem Befehl: `npx monemee init`.

Gedacht ist es für alle, die lieber Funktionen bauen als Abrechnung: Indie-Entwickler, Agenturen und alle, die eine App mit Cursor, Claude Code, Lovable oder von Hand gebaut haben und sie jetzt verkaufen wollen.

```bash
npx monemee init
```

Die CLI loggt dich im Browser ein, legt das Produkt an, schreibt die `.env` und bindet Monemee in deinen Code ein. Alles startet im Testmodus. Du kannst den kompletten Kauf also ohne echtes Geld durchspielen.

## Inhalt

- [Was du bekommst](#was-du-bekommst)
- [Paywall in eine Web-App einbauen](#paywall-in-eine-web-app-einbauen-express-nextjs-react)
- [Lizenzschlüssel in Desktop-Apps prüfen](#lizenzschlüssel-in-desktop-apps-und-download-software-prüfen)
- [Neue Versionen aus GitHub Releases](#neue-versionen-aus-github-releases-veröffentlichen)
- [Pakete](#pakete)
- [So läuft ein Kauf ab](#so-läuft-ein-kauf-ab)
- [Sicherheit](#sicherheit)
- [Häufige Fragen](#häufige-fragen)

## Was du bekommst

| Funktion | Was das für dich heißt |
|---|---|
| Bezahlseite | Ein Kauf-Link pro Produkt. Kartenzahlung läuft über Stripe, Kartendaten siehst du nie. |
| Freischaltung nach dem Kauf | Käufer landen wieder in deiner App und sind schon freigeschaltet. Kein Schlüssel zum Abtippen, keine neue Datenbank-Spalte. |
| Zugangsprüfung | `requireAccess()` auf dem Server, `<AccessGate>` in React. Erstattungen entziehen den Zugang automatisch. |
| Lizenzschlüssel | Geräte-Limit, Laufzeit und Plan-Name für Software zum Herunterladen. |
| Offline-Lizenzprüfung | Jede Antwort ist mit Ed25519 signiert. Apps laufen eine Weile auch ohne Internet weiter. |
| Testmodus | Getrennte Test- und Live-Secrets. Testkäufe kosten nichts und verhalten sich wie echte. |
| Automatische Releases | Eine GitHub Action lädt jede neue Version hoch, bisherige Käufer bekommen sie über ihre Links. |
| KI-Assistenten | [`AGENTS.md`](AGENTS.md) und fertige Skills lassen Claude Code, Cursor oder Copilot die Einrichtung übernehmen. |

## Paywall in eine Web-App einbauen (Express, Next.js, React)

Bei Apps mit Login verknüpft Monemee jeden Kauf mit der Nutzer-ID deines eigenen Logins. Dein Server fragt dann nur noch, ob dieser Nutzer Zugang hat.

```js
// server.js (Express)
const monemee = require('@monemee/node')({ getRef: (req) => req.user?.id });

app.use(monemee.webhook());        // vor express.json()
app.use(express.json());
app.use(session(/* dein Login */));
app.use(monemee.routes());         // nach deinem Login

app.get('/api/pro', monemee.requireAccess(), (req, res) => {
  res.json({ plan: req.monemee.plan });
});
```

```jsx
// App.jsx (React)
import { MonemeeProvider, AccessGate, BuyButton } from '@monemee/react';

<MonemeeProvider>
  <AccessGate fallback={<BuyButton>Pro freischalten</BuyButton>}>
    <ProFunktion />
  </AccessGate>
</MonemeeProvider>
```

Für Next.js reicht eine Route-Datei: `export const { GET, POST } = monemee.nextRoute();`. Apps mit Token-Login im Browser (Firebase, Supabase, Auth0) geben das Token über `getHeaders` mit. Mehr dazu in [@monemee/node](packages/node) und [@monemee/react](packages/react), eine komplette lauffähige App liegt unter [templates/express-react](templates/express-react).

## Lizenzschlüssel in Desktop-Apps und Download-Software prüfen

Käufer bekommen ihren Lizenzschlüssel per E-Mail. Deine App aktiviert ihn einmal pro Gerät und prüft ihn bei jedem Start.

```js
// Electron, Tauri, Browser-Erweiterungen, Node-CLIs
import { createLicense } from '@monemee/client';

const license = createLicense({ productId: 123 });
await license.activate('MM-XXXX-XXXX-XXXX-XXXX');

const { valid, plan, offline } = await license.check();
if (valid) startPro(plan);
```

```python
# Python-Tools und Desktop-Apps: pip install "monemee[offline]"
from monemee import License

license = License(product_id=123)
if license.check().valid:
    run_pro()
```

`check()` prüft die Signatur jeder Antwort und merkt sich die letzte gültige. Ohne Internet bleibt die Lizenz `graceDays` lang gültig (Standard: 7 Tage). Siehe [@monemee/client](packages/client) und das [Python-Paket](packages/python).

## Neue Versionen aus GitHub Releases veröffentlichen

```yaml
# .github/workflows/monemee.yml
on:
  release:
    types: [published]
jobs:
  upload:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build && zip -r app.zip dist
      - uses: monemee/monemee-sdk/action@v1
        with:
          api-key: ${{ secrets.MONEMEE_API_KEY }}
          product-id: 123
          file: app.zip
```

Die Datei wird im bestehenden Produkt ersetzt. Download-Links, die Käufer schon bekommen haben, funktionieren weiter und liefern die neue Version. Mehr in der [Action-Doku](action).

### Kauf-Knopf für deine README

```markdown
[![Kaufen auf Monemee](https://monemee.com/api/v1/products/123/badge.svg)](https://monemee.com/p/123)
```

## Pakete

| Paket | Installation | Wofür |
|---|---|---|
| [`monemee`](packages/cli) (CLI) | `npx monemee init` | Einrichten, Testkauf, Live schalten, Prüfen |
| [`@monemee/node`](packages/node) | `npm i @monemee/node` | Server von Web-Apps: Express, Next.js, Hono und andere Web-Standard-Runtimes |
| [`@monemee/react`](packages/react) | `npm i @monemee/react` | Paywall-Komponenten und `useAccess`-Hook |
| [`@monemee/client`](packages/client) | `npm i @monemee/client` | Lizenzschlüssel in Electron, Tauri, Erweiterungen und CLIs |
| [`monemee`](packages/python) (Python) | `pip install monemee` | Lizenzschlüssel und Web-Zugang in Python, Flask, FastAPI, Django |
| [GitHub Action](action) | `uses: monemee/monemee-sdk/action@v1` | Release-Dateien als neue Produktversion hochladen |

Beispiele für Electron, Chrome-Erweiterungen, Flask, Next.js und Python-CLIs findest du unter [examples](examples).

## So läuft ein Kauf ab

1. Deine App verlinkt auf `/monemee/buy`. Das SDK leitet zur Bezahlseite weiter, der eingeloggte Nutzer ist schon verknüpft.
2. Der Käufer bezahlt. Monemee stellt eine Lizenz aus und leitet mit einem einmaligen Token zurück in deine App.
3. Dein Server löst den Token mit seinem App-Secret ein. Die Lizenz gehört jetzt diesem Nutzer.
4. Ab jetzt liefert `hasAccess(userId)` `true`. Erstattungen und Sperren setzen es auf `false`, mit Webhooks sofort.

Bei Download-Software entfallen Schritt 1 und 3: Der Käufer gibt den Schlüssel aus der Kauf-Mail ein, und die App aktiviert ihn.

## Sicherheit

- Das App-Secret (`mmapp_…`) bleibt auf deinem Server und darf nur Zugang prüfen und freischalten, für genau ein Produkt.
- Rücksprung-Tokens gelten nur einmal und laufen nach 30 Minuten ab.
- Eine eingelöste Lizenz gehört genau einem Nutzer. Wer einen Link oder Schlüssel weitergibt, schaltet damit kein zweites Konto frei.
- Webhooks sind per HMAC-SHA256 signiert und werden nach fünf Minuten abgelehnt.
- Lizenzantworten sind mit Ed25519 signiert. Der öffentliche Schlüssel steckt in den Paketen und liegt unter `/.well-known/monemee-license-keys.json`.

Sicherheitslücken meldest du wie in [SECURITY.md](SECURITY.md) beschrieben.

## Häufige Fragen

### Wie baue ich eine Lizenzschlüssel-Prüfung in meine App ein?
Installiere `@monemee/client` (JavaScript) oder `monemee` (Python), rufe einmal `activate(key)` auf und bei jedem Start `check()`. Schlüssel erzeugen, per E-Mail zustellen, Geräte-Limits, Laufzeiten und Erstattungen übernimmt Monemee.

### Funktioniert die Lizenzprüfung offline?
Ja. Jede Antwort ist mit Ed25519 signiert. Das SDK speichert die letzte gültige Antwort und akzeptiert sie ohne Internet für eine einstellbare Zeit, standardmäßig sieben Tage. Manipulierte oder fremde Antworten werden abgelehnt.

### Brauche ich eine eigene Datenbank, um zahlende Nutzer zu speichern?
Nein. Käufe sind an die Nutzer-ID deines Logins gebunden. Dein Server fragt `hasAccess(userId)` und merkt sich die Antwort fünf Minuten lang.

### Wie teste ich den Kauf, ohne zu bezahlen?
`npx monemee init` legt ein Test-Secret an. Starte dann `npx monemee test-buy` oder klicke in der Paywall auf den Testkauf. Testlizenzen verhalten sich wie echte und sind nur im Testmodus sichtbar.

### Welche Frameworks werden unterstützt?
Express und Next.js (App Router) auf dem Server, dazu jede Runtime mit Web-Standard-`Request`/`Response` wie Hono, Bun oder Deno. Im Browser React, für Download-Software Electron, Tauri, Browser-Erweiterungen und Node-CLIs, außerdem Python mit Flask, FastAPI und Django.

### Was kostet das?
Das SDK ist kostenlos und steht unter MIT-Lizenz. Monemee nimmt eine Gebühr pro Verkauf, die mit deinem Umsatz von 29 % auf 9 % sinkt. Eine monatliche Grundgebühr gibt es nicht. Mehr auf [monemee.com](https://monemee.com).

### Kann mein KI-Assistent das einrichten?
Ja. Sag ihm „Verkauf diese App über Monemee“. Er liest [AGENTS.md](AGENTS.md). Skills für Claude Code und Cursor liegen unter [skills](skills).

## Mitmachen

Fehlerberichte und Pull Requests für das SDK sind willkommen, bitte vorher [CONTRIBUTING.md](CONTRIBUTING.md) lesen. Fragen zu deinem Monemee-Konto stellst du über den Support im Dashboard.

## Lizenz

[MIT](LICENSE)
