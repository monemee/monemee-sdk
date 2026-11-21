# @monemee/react

Freischalten im Frontend. Passt zu [@monemee/node](../node) auf deinem Server, ein Secret im Browser gibt es nicht.

```bash
npm install @monemee/react
```

```jsx
import { MonemeeProvider, AccessGate, BuyButton, LicenseForm } from '@monemee/react';

export default function App() {
  return (
    <MonemeeProvider>
      <AccessGate fallback={<BuyButton>Pro freischalten – 19 €</BuyButton>}>
        <ProFeature />
      </AccessGate>
    </MonemeeProvider>
  );
}
```

## Login per Token (Firebase, Supabase, Auth0 …)

Wenn deine App das Login-Token als Header schickt statt per Cookie:

```jsx
<MonemeeProvider getHeaders={async () => ({ Authorization: `Bearer ${await auth.currentUser.getIdToken()}` })}>
```

Setze die **Rücksprung-URL** in Monemee dann auf eine Seite deiner App (z. B. `https://deine-app.de/pro`). Der Provider löst `?monemee_claim=…` beim Laden selbst ein und entfernt ihn aus der Adresszeile.

Bei Cookie-Login zeigt die Rücksprung-URL auf `https://deine-app.de/monemee/return`. Das übernimmt dann der Server.

## Hook

```jsx
const { loading, access, plan, expiresAt, buy, testBuy, unlock, refresh } = useAccess();
```

- `buy()` öffnet die Bezahlseite. Der Kauf ist dann schon mit dem eingeloggten Nutzer verknüpft.
- `testBuy()` startet nur im Testmodus einen Testkauf ohne Geld, mit dem echten Ablauf.
- `<LicenseForm />` ist für Käufer, die ohne Rücksprung gekauft haben (der Schlüssel steht in ihrer Mail).

MIT-Lizenz
