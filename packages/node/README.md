# @monemee/node

Verkaufe deine Web-App über Monemee. Käufer bezahlen bei Monemee, landen danach wieder in deiner App und sind dort sofort freigeschaltet. Eine eigene Datenbank-Spalte brauchst du dafür nicht.

```bash
npx monemee init        # richtet alles ein (Login, Produkt, .env, Code)
```

Oder von Hand:

```bash
npm install @monemee/node
```

## Express

```js
const express = require('express');
const monemee = require('@monemee/node')({
  getRef: (req) => req.user?.id,          // Nutzer-ID aus deinem Login
  loginUrl: (back) => `/login?next=${encodeURIComponent(back)}`
});

const app = express();
app.use(monemee.webhook());               // ganz oben: braucht den rohen Body
app.use(express.json());
app.use(session(/* … */));                // dein Login
app.use(monemee.routes());                // NACH deinem Login: kennt dann req.user

app.get('/api/pro-feature', monemee.requireAccess(), (req, res) => {
  res.json({ ok: true, plan: req.monemee.plan });
});
```

`.env`:

```bash
MONEMEE_APP_SECRET=mmapp_test_…    # Lizenzschlüssel → App-Anbindung (oder npx monemee init)
MONEMEE_PRODUCT_ID=123
```

## Next.js (App Router)

```js
// lib/monemee.js
import createMonemee from '@monemee/node';
import { auth } from './auth';
export const monemee = createMonemee({ getRef: async () => (await auth())?.user?.id });

// app/monemee/[...monemee]/route.js
import { monemee } from '@/lib/monemee';
export const { GET, POST } = monemee.nextRoute();

// app/api/pro/route.js
export async function GET(request) {
  const { response, access } = await monemee.guard(request);
  if (response) return response;           // 401 / 402 mit buy_url
  return Response.json({ plan: access.plan });
}
```

Hono, Bun, Deno, Cloudflare Workers: `await monemee.handleRequest(request)` liefert eine `Response` oder `null`.

## Was die eingebauten Routen tun

| Route | Zweck |
|---|---|
| `GET /monemee/buy` | Leitet zur Bezahlseite, der Kauf ist schon mit dem eingeloggten Nutzer verknüpft |
| `GET /monemee/return` | Rücksprung nach dem Kauf: schaltet frei, dann weiter zu `successPath` (`?monemee=unlocked`) |
| `GET /monemee/access` | `{ access, plan, expires_at, buy_url }` für dein Frontend ([@monemee/react](../react)) |
| `GET /monemee/buy-url` | `{ url }`: dasselbe als JSON, für Apps mit Token-Login im Browser |
| `POST /monemee/unlock` | `{ claim }` oder `{ key }`: Freischalten aus dem Browser (Token-Login) bzw. per Lizenzschlüssel |
| `POST /monemee/webhook` | Erstattungen und Sperren sofort übernehmen (mit `MONEMEE_WEBHOOK_SECRET`) |
| `GET /monemee/test-buy` | Nur mit Test-Secret: Testkauf ohne Geld, echter Ablauf |

## Ohne die Routen

```js
await monemee.hasAccess(userId);              // true / false
await monemee.access(userId);                 // { access, reason, plan, expires_at }
await monemee.buyUrl(userId);                 // https://monemee.com/buy/123?ref=…
await monemee.unlock({ claim, ref: userId }); // Rücksprung-Token einlösen
await monemee.unlock({ key, ref: userId });   // Lizenzschlüssel einlösen
```

## Gut zu wissen

- **Testmodus zuerst:** Mit `mmapp_test_…` siehst du nur Testkäufe. Live schaltest du mit `npx monemee live`.
- **Zwischenspeicher:** Ergebnisse werden 5 Minuten gemerkt (`cacheSeconds`). Mit Webhook wird eine Erstattung sofort wirksam, ohne Webhook spätestens nach Ablauf.
- **Sicher:** Das App-Secret gehört nur auf den Server. Es darf ausschließlich Zugang prüfen und freischalten, und zwar für genau ein Produkt.
- **Weitergabe:** Eine eingelöste Lizenz ist an einen Nutzer gebunden und lässt sich nicht für ein zweites Konto verwenden.
- **Monemee nicht erreichbar:** `requireAccess` antwortet mit 503 und schaltet nicht still frei.

MIT-Lizenz
