# Next.js (App Router)

```js
// lib/monemee.js
import createMonemee from '@monemee/node';
import { auth } from '@/auth';                          // Auth.js
export const monemee = createMonemee({ getRef: async () => (await auth())?.user?.id });
```
```js
// app/monemee/[...monemee]/route.js
import { monemee } from '@/lib/monemee';
export const { GET, POST } = monemee.nextRoute();
```
```js
// app/api/pro/route.js
import { monemee } from '@/lib/monemee';
export async function GET(request) {
  const { response, access } = await monemee.guard(request);
  if (response) return response;
  return Response.json({ plan: access.plan });
}
```
```jsx
// app/pro/page.jsx
'use client';
import { MonemeeProvider, AccessGate, BuyButton } from '@monemee/react';
export default function Pro() {
  return (
    <MonemeeProvider>
      <AccessGate fallback={<BuyButton>Pro freischalten</BuyButton>}><h1>Pro ✓</h1></AccessGate>
    </MonemeeProvider>
  );
}
```
Rücksprung-URL in Monemee: `https://deine-app.de/monemee/return`
