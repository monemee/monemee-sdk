# Template: Express and React app with a Monemee paywall

A small, runnable app with login, a Pro area, checkout, test purchases and unlocking after payment. Copy it, connect your product, done.

```bash
npx degit monemee/monemee-sdk/templates/express-react my-app
cd my-app
npm install
npx monemee init --skip-install     # login, product, test secret -> server/.env
npm run dev                         # http://localhost:5173
```

Log in with any name (demo login), click "Test purchase (no payment)" and the Pro area unlocks.

**Where things happen**

- `server/index.js`: the Monemee setup in the right order and the protected route `/api/pro`
- `client/src/App.jsx`: the paywall with `AccessGate`, `BuyButton` and `LicenseForm`

The demo login (a cookie with your name) is only for trying things out. Replace it with your real login and adjust `getRef`.
