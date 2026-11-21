// npm i express express-session @monemee/node   ·   MONEMEE_APP_SECRET in .env (npx monemee init)
const express = require('express');
const session = require('express-session');
const monemee = require('@monemee/node')({
  getRef: (req) => req.session.userId,
  loginUrl: (back) => `/login?next=${encodeURIComponent(back)}`
});

const app = express();
app.use(monemee.webhook());                                   // before express.json()
app.use(express.json());
app.use(session({ secret: process.env.SESSION_SECRET || 'dev', resave: false, saveUninitialized: false }));
app.use(monemee.routes());                                    // after the session

app.get('/login', (req, res) => { req.session.userId = 'demo'; res.redirect(req.query.next || '/'); });
app.get('/', async (req, res) => {
  const pro = req.session.userId && (await monemee.hasAccess(req.session.userId));
  res.send(pro ? '<h1>Pro</h1>' : '<a href="/monemee/buy">Buy Pro</a> · <a href="/monemee/test-buy">Test purchase</a>');
});
app.get('/api/pro', monemee.requireAccess(), (req, res) => res.json({ plan: req.monemee.plan }));

app.listen(3000, () => console.log('http://localhost:3000/login'));
