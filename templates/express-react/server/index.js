require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const path = require('path');
const express = require('express');
const createMonemee = require('monemee-node');

const app = express();

// Monemee: checkout, unlock after purchase, access checks
const monemee = createMonemee({
  getRef: (req) => req.user?.id,                    // user ID from your login
  loginUrl: (back) => `/?login=1&next=${encodeURIComponent(back)}`
});
app.use(monemee.webhook());                         // before express.json(): needs the raw body

app.use(express.json());

// --- Demo login: a cookie with a name. Use your real login (session, Passport, Firebase ...) ---
app.use((req, res, next) => {
  const m = /(?:^|;\s*)demo_user=([\w-]{1,40})/.exec(req.headers.cookie || '');
  req.user = m ? { id: m[1] } : null;
  next();
});
app.post('/api/login', (req, res) => {
  const name = String(req.body?.name || '').replace(/[^\w-]/g, '').slice(0, 40);
  if (!name) return res.status(400).json({ error: 'name is required' });
  res.setHeader('Set-Cookie', `demo_user=${name}; Path=/; HttpOnly; SameSite=Lax`);
  res.json({ id: name });
});
app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'demo_user=; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/me', (req, res) => res.json({ user: req.user }));
// --- End of demo login ---

app.use(monemee.routes());                          // after the login: /monemee/buy, /return, /access ...

// Paid content, buyers only
app.get('/api/pro', monemee.requireAccess(), (req, res) => {
  res.json({ message: 'Welcome to the Pro area!', plan: req.monemee.plan, test: Boolean(req.monemee.test) });
});

// Production: serve the built frontend
const dist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(dist));
app.get(/^\/(?!api|monemee).*/, (req, res, next) => res.sendFile(path.join(dist, 'index.html'), (err) => err && next()));

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Server: http://localhost:${port} (${monemee.mode === 'test' ? 'test mode' : 'LIVE'})`));
