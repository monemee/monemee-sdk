# Vorlage: Express + React mit Monemee

Eine kleine, lauffähige App mit Login, Pro-Bereich, Kauf, Testkauf und Freischaltung nach dem Kauf. Kopieren, Produkt verbinden, fertig.

```bash
npx degit monemee/monemee-dev/templates/express-react meine-app
cd meine-app
npm install
npx monemee init --skip-install     # Login, Produkt, Test-Secret → server/.env
npm run dev                         # http://localhost:5173
```

Dann im Browser einloggen (Demo-Login mit beliebigem Namen), „Testkauf (ohne Geld)“ klicken, und der Pro-Bereich ist frei.

**Wo was passiert:**

- `server/index.js`: Monemee-Einbindung in der richtigen Reihenfolge, geschützte Route `/api/pro`
- `client/src/App.jsx`: Paywall mit `AccessGate`, `BuyButton`, `LicenseForm`

Der Demo-Login (Cookie mit Namen) ist nur zum Ausprobieren gedacht. Ersetze ihn durch deinen echten Login und passe `getRef` an.
