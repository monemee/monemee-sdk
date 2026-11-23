---
title: App verkaufen mit Lizenzschlüssel, Paywall und Bezahlseite
description: Das Monemee SDK bringt Bezahlseite, Freischaltung nach dem Kauf und Lizenzschlüssel-Prüfung mit Offline-Modus in deine App. Eingerichtet mit einem Befehl.
permalink: /de/
lang: de
alternate: /
alternate_lang: en
updated: 2026-11-22
---

# App verkaufen mit Lizenzschlüssel, Paywall und Bezahlseite

<p class="lead">Mit dem Monemee SDK verkaufst du eine App, die du gebaut hast. Es bringt eine Bezahlseite mit, schaltet Käufer direkt nach dem Kauf in deiner App frei und prüft Lizenzschlüssel für Desktop-Software, auch offline.</p>

```bash
npx monemee init
```

Die CLI loggt dich im Browser ein, legt das Produkt an, schreibt die `.env` und bindet Monemee in deinen Code ein. Alles startet im Testmodus, du kannst den Kaufablauf also ohne echtes Geld durchspielen: Ein Testkauf überspringt nur die Zahlung, ab dem Rücksprung in deine App ist alles echt.

## Paywall in eine Web-App einbauen

Für Apps mit Login (Express, Next.js, React) verknüpft Monemee den Kauf mit der Nutzer-ID deines Logins:

```js
const monemee = require('monemee-node')({ getRef: (req) => req.user?.id });
app.use(monemee.routes());
app.get('/api/pro', monemee.requireAccess(), handler);
```

```jsx
<MonemeeProvider>
  <AccessGate fallback={<BuyButton>Pro freischalten</BuyButton>}>…</AccessGate>
</MonemeeProvider>
```

Ausführlich: [Web-Apps](/web-apps/) (englisch).

## Lizenzschlüssel in Desktop-Apps prüfen

Käufer bekommen den Schlüssel per E-Mail. Deine App aktiviert ihn einmal und prüft ihn bei jedem Start, ohne Internet bis zu sieben Tage lang:

```js
const license = createLicense({ productId: 123 });
await license.activate('MM-XXXX-XXXX-XXXX-XXXX');
const { valid } = await license.check();
```

Python: `pip install "monemee[offline]"`. Swift (macOS, iOS): Paket `https://github.com/monemee/monemee-sdk.git`, Produkt `Monemee`. Ausführlich: [Lizenzschlüssel](/license-keys/) (englisch).

## Neue Versionen automatisch ausliefern

Eine GitHub Action lädt jedes Release hoch. Bisherige Käufer bekommen die neue Version über ihre Download-Links: [Releases](/github-action/).

## Was es kostet

Das SDK ist kostenlos (MIT-Lizenz). Monemee nimmt eine Gebühr pro Verkauf, die mit deinem Umsatz von 29 % auf 9 % sinkt. Eine monatliche Grundgebühr gibt es nicht.

Die vollständige deutsche Beschreibung steht in der [README auf GitHub](https://github.com/monemee/monemee-sdk/blob/main/README.de.md).
