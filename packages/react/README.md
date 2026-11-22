# @monemee/react

React components for a paywall backed by Monemee: show content only to buyers, render a buy button and let customers enter a license key. Pairs with [@monemee/node](../node) on your server, and no secret ever reaches the browser.

[Monemee SDK](https://github.com/monemee/monemee-sdk) · [Deutsch](https://github.com/monemee/monemee-sdk/blob/main/README.de.md) · [Documentation](https://dev.monemee.com)

```bash
npm install @monemee/react
```

```jsx
import { MonemeeProvider, AccessGate, BuyButton, LicenseForm } from '@monemee/react';

export default function App() {
  return (
    <MonemeeProvider>
      <AccessGate fallback={<BuyButton>Unlock Pro</BuyButton>}>
        <ProFeature />
      </AccessGate>
    </MonemeeProvider>
  );
}
```

## Token-based login (Firebase, Supabase, Auth0)

If your app sends the login token as a header instead of a cookie:

```jsx
<MonemeeProvider getHeaders={async () => ({ Authorization: `Bearer ${await auth.currentUser.getIdToken()}` })}>
```

Set the return URL in Monemee to a page of your app, for example `https://your-app.com/pro`. The provider redeems `?monemee_claim=...` on load and removes it from the address bar. With cookie-based login, point the return URL at `https://your-app.com/monemee/return` and let the server handle it.

## Hook

```jsx
const { loading, access, plan, expiresAt, buy, testBuy, unlock, refresh } = useAccess();
```

- `buy()` opens the checkout with the logged-in user attached.
- `testBuy()` runs a free test purchase through the real flow (test mode only).
- `<LicenseForm />` lets customers who bought without the return flow paste the key from their purchase email.

## Texts and language

The default texts (buy button, license form, error messages) come in English and German. Without a `locale` prop, the provider picks German when `navigator.language` starts with `de` and English otherwise. Override single texts with `messages`; text props on a component (`children`, `label`, `submitLabel`) still win.

```jsx
<MonemeeProvider locale="en" messages={{ buyButton: 'Get Pro', licenseSubmit: 'Activate' }}>
```

With server-side rendering, set `locale` explicitly so server and browser render the same text. All keys are listed in `defaultMessages` and in `index.d.ts`.

## Components

| Component | Props |
|---|---|
| `MonemeeProvider` | `basePath`, `getHeaders`, `handleReturn`, `onUnlocked`, `navigate`, `fetch`, `locale`, `messages` |
| `AccessGate` | `fallback`, `loading` |
| `BuyButton` | any anchor props |
| `LicenseForm` | `label`, `submitLabel`, `onUnlocked`, `className` |

No build step, no styling opinions, TypeScript definitions included. Works with React 17 and newer.

MIT License
