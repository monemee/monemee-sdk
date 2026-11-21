require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const path = require('path');
const express = require('express');
const createMonemee = require('@monemee/node');

const app = express();

// Monemee: Kauf, Freischaltung nach dem Kauf, Zugangsprüfung
const monemee = createMonemee({
  getRef: (req) => req.user?.id,                    // ← Nutzer-ID aus deinem Login
  loginUrl: (back) => `/?login=1&next=${encodeURIComponent(back)}`
});
app.use(monemee.webhook());                         // vor express.json(): braucht den rohen Body

app.use(express.json());

// --- Demo-Login: Cookie mit Namen. In echt: Session, Passport, Firebase … ---
app.use((req, res, next) => {
  const m = /(?:^|;\s*)demo_user=([\w-]{1,40})/.exec(req.headers.cookie || '');
  req.user = m ? { id: m[1] } : null;
  next();
});
app.post('/api/login', (req, res) => {
  const name = String(req.body?.name || '').replace(/[^\w-]/g, '').slice(0, 40);
  if (!name) return res.status(400).json({ error: 'name fehlt' });
  res.setHeader('Set-Cookie', `demo_user=${name}; Path=/; HttpOnly; SameSite=Lax`);
  res.json({ id: name });
});
app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'demo_user=; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/me', (req, res) => res.json({ user: req.user }));
// --- Ende Demo-Login ---

app.use(monemee.routes());                          // nach dem Login: /monemee/buy, /return, /access …

// Bezahlter Inhalt – nur mit Kauf
app.get('/api/pro', monemee.requireAccess(), (req, res) => {
  res.json({ message: 'Willkommen im Pro-Bereich!', plan: req.monemee.plan, test: Boolean(req.monemee.test) });
});

// Produktion: gebautes Frontend ausliefern
const dist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(dist));
app.get(/^\/(?!api|monemee).*/, (req, res, next) => res.sendFile(path.join(dist, 'index.html'), (err) => err && next()));

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Server: http://localhost:${port} (${monemee.mode === 'test' ? 'Testmodus' : 'LIVE'})`));
