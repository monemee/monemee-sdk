# Monemee Dev-Kit

**Du baust, Monemee verkauft.** Mach aus deiner App ein Produkt mit Bezahlseite, Freischaltung und Lizenzprüfung: ein Befehl, ein paar Zeilen Code.

```bash
npx monemee init
```

Der Befehl loggt dich im Browser ein, legt das Produkt an, schreibt die `.env` und bindet Monemee in deinen Code ein. Alles startet im **Testmodus**, du testest also ohne Geld.

---

## Welcher Weg passt zu deiner App?

### 1 · Web-App mit Login (Express, Next.js, React …)

Käufer bezahlen bei Monemee, landen wieder in deiner App und sind sofort freigeschaltet. Eine eigene Datenbank-Spalte brauchst du nicht.

```js
const monemee = require('@monemee/node')({ getRef: (req) => req.user?.id });
app.use(monemee.routes());
app.get('/api/pro', monemee.requireAccess(), handler);
```
```jsx
<MonemeeProvider>
  <AccessGate fallback={<BuyButton>Pro freischalten</BuyButton>}>…</AccessGate>
</MonemeeProvider>
```

→ [`@monemee/node`](packages/node) · [`@monemee/react`](packages/react) · [Vorlage Express + React](templates/express-react)

### 2 · Software zum Herunterladen (Desktop, CLI, Browser-Erweiterung, Plugin)

Käufer bekommen einen Lizenzschlüssel. Deine App aktiviert ihn einmal und läuft danach auch offline, abgesichert durch signierte Antworten.

```js
import { createLicense } from '@monemee/client';
const license = createLicense({ productId: 123 });
await license.activate('MM-XXXX-XXXX-XXXX-XXXX');
if ((await license.check()).valid) startPro();
```

→ [`@monemee/client`](packages/client) · [Python `monemee`](packages/python) · [Beispiele: Electron, Browser-Erweiterung, Python-CLI, Flask, Next.js](examples)

### 3 · Mach's mit KI

Sag deinem Assistenten (Claude Code, Cursor, Copilot …):

> Verkauf diese App über Monemee.

Er liest [`AGENTS.md`](AGENTS.md) und richtet alles ein. Für Claude Code gibt es zusätzlich einen fertigen [Skill](skills/claude-code).

---

## Neue Versionen automatisch hochladen

```yaml
# .github/workflows/release.yml
on: { release: { types: [published] } }
jobs:
  monemee:
    runs-on: ubuntu-latest
    steps:
      - uses: monemee/monemee-dev/action@v1
        with:
          api-key: ${{ secrets.MONEMEE_API_KEY }}
          product-id: 123
          file: dist/meine-app.zip
```

→ [GitHub Action](action)

## Kauf-Knopf und Abzeichen

```markdown
[![Kaufen auf Monemee](https://monemee.com/api/v1/products/123/badge.svg)](https://monemee.com/p/123)
```

## Befehle

| Befehl | Was er tut |
|---|---|
| `npx monemee init` | Einrichten: Login, Produkt, Test-Secret, `.env`, Code |
| `npx monemee test-buy` | Testkauf ohne Geld, mit dem echten Ablauf bis zur Freischaltung |
| `npx monemee live` | Live schalten: Rücksprung-URL, Live-Secret, Webhook |
| `npx monemee doctor` | Prüft die Einrichtung |

## Sicherheit in einem Satz

Das App-Secret bleibt auf deinem Server und darf nur Zugang prüfen, und zwar für genau ein Produkt. Im Browser liegt nie ein Geheimnis, und Download-Software prüft signierte Antworten. Details: [SECURITY.md](SECURITY.md).

## API

Alles, was die Pakete tun, geht auch direkt per HTTP → [`openapi.yaml`](openapi.yaml) · [API-Doku](https://monemee.com/api-docs)

MIT-Lizenz · Fehler im SDK: [Issues](https://github.com/monemee/monemee-dev/issues) · Alles andere: Support in deinem Monemee-Konto
