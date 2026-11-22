import fs from 'node:fs';
import path from 'node:path';

/**
 * Projekt erkennen, .env pflegen und Code minimal-invasiv anpassen.
 * Grundsatz: lieber einen Schnipsel ausgeben als fremden Code kaputt machen.
 */

const TOKEN_LOGIN_LIBS = ['firebase', '@supabase/supabase-js', '@auth0/auth0-react', '@clerk/clerk-react', 'aws-amplify', '@react-oauth/google'];
const SERVER_CANDIDATES = ['server.js', 'app.js', 'index.js', 'src/server.js', 'src/app.js', 'src/index.js', 'server/index.js', 'server/server.js', 'server/app.js', 'server/src/index.js', 'server/src/app.js'];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

function deps(pkg) {
  return { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
}

/**
 * @returns {{
 *   framework: 'next'|'express'|'fastify'|'node'|'python'|'unknown',
 *   serverDir: string, clientDir: string|null, react: boolean,
 *   login: 'token'|'cookie', serverEntry: string|null, port: number, appDir: string|null
 * }}
 */
export function detectProject(cwd) {
  const rootPkg = readJson(path.join(cwd, 'package.json'));
  const subdirs = ['', 'server', 'backend', 'api', 'client', 'frontend', 'web'];
  const pkgs = subdirs
    .map((d) => ({ dir: path.join(cwd, d), pkg: d === '' ? rootPkg : readJson(path.join(cwd, d, 'package.json')) }))
    .filter((p) => p.pkg);

  const has = (name) => pkgs.find((p) => deps(p.pkg)[name]);
  const react = Boolean(has('react'));
  const login = TOKEN_LOGIN_LIBS.some((lib) => has(lib)) ? 'token' : 'cookie';
  const clientDir = (pkgs.find((p) => deps(p.pkg).react && !deps(p.pkg).next) || {}).dir || null;

  const next = has('next');
  if (next) {
    const appDir = ['app', 'src/app'].map((d) => path.join(next.dir, d)).find((d) => fs.existsSync(d)) || null;
    return { framework: 'next', serverDir: next.dir, clientDir: next.dir, react: true, login, serverEntry: null, port: 3000, appDir };
  }
  for (const name of ['express', 'fastify']) {
    const p = has(name);
    if (p) {
      const entry = findServerEntry(p.dir, cwd);
      return { framework: name, serverDir: p.dir, clientDir, react, login, serverEntry: entry, port: guessPort(entry), appDir: null };
    }
  }
  if (fs.existsSync(path.join(cwd, 'requirements.txt')) || fs.existsSync(path.join(cwd, 'pyproject.toml'))) {
    return { framework: 'python', serverDir: cwd, clientDir, react, login, serverEntry: null, port: 8000, appDir: null };
  }
  return { framework: rootPkg ? 'node' : 'unknown', serverDir: cwd, clientDir, react, login, serverEntry: null, port: 3000, appDir: null };
}

function findServerEntry(dir, cwd) {
  const pkg = readJson(path.join(dir, 'package.json'));
  const fromPkg = pkg?.main ? [pkg.main] : [];
  const candidates = [...fromPkg, ...SERVER_CANDIDATES].map((f) => path.resolve(dir, f));
  for (const file of [...new Set(candidates)]) {
    if (!fs.existsSync(file) || !file.startsWith(cwd)) continue;
    const src = fs.readFileSync(file, 'utf8');
    if (/\b(?:express|fastify)\s*\(/.test(src)) return file;
  }
  return null;
}

function guessPort(entry) {
  if (!entry) return 3000;
  const m = fs.readFileSync(entry, 'utf8').match(/PORT\s*\|\|\s*(\d{2,5})|listen\(\s*(\d{2,5})/);
  return m ? Number(m[1] || m[2]) : 3000;
}

// ---------- .env ----------

/** Setzt/ersetzt Schlüssel in .env, lässt alles andere unverändert. */
export function upsertEnv(file, values) {
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(text)) text = text.replace(re, line);
    else text = `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`;
  }
  fs.writeFileSync(file, text, { mode: 0o600 });
}

export function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

/** .env muss in .gitignore stehen – Secrets nie committen. */
export function ensureGitignored(dir, entry = '.env') {
  const file = path.join(dir, '.gitignore');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (text.split('\n').some((l) => l.trim() === entry || l.trim() === `/${entry}`)) return false;
  fs.writeFileSync(file, `${text}${text && !text.endsWith('\n') ? '\n' : ''}${entry}\n`);
  return true;
}

// ---------- Code ----------

export const EXPRESS_SNIPPET = (login) => `const monemee = require('monemee-node')({
  getRef: (req) => req.user?.id,   // ← user ID from your login${login === 'token' ? '\n  // Token login: verify the token from req.headers.authorization here and return the user ID' : ''}
});
app.use(monemee.webhook());        // right after express(), before express.json()
// … express.json(), session/login …
app.use(monemee.routes());         // after your login, before your routes

// Example: protected route
// app.get('/api/pro', monemee.requireAccess(), handler);`;

/**
 * Bindet Monemee in eine Express-App ein – nur wenn eindeutig:
 *  - direkt nach `const app = express()`: Monemee anlegen + app.use(monemee.webhook())
 *    (der Webhook braucht den rohen Body, also vor express.json())
 *  - direkt vor der ersten eigenen Route (app.get/post/…, app.use('/pfad', …), app.listen):
 *    app.use(monemee.routes()) – dann ist deine Login-Middleware schon gelaufen
 * @returns {'patched'|'already'|'manual'}
 */
export function patchExpress(file, login) {
  const src = fs.readFileSync(file, 'utf8');
  if (src.includes('monemee-node')) return 'already';
  const isEsm = /^\s*import\s.+from\s+['"]/m.test(src);
  const matches = [...src.matchAll(/^([ \t]*)(?:const|let|var)\s+(\w+)\s*=\s*express\(\s*\)[ \t]*;?[ \t]*$/gm)];
  if (matches.length !== 1) return 'manual';
  const [line, indent, app] = matches[0];
  const afterCreate = matches[0].index + line.length;

  // Erste eigene Route nach der App-Erzeugung
  const routeRe = new RegExp(
    `^[ \\t]*${app}\\.(?:(?:get|post|put|patch|delete|all|route)\\(|use\\(\\s*['"\`/]|use\\(\\s*\\w*[Rr]outer|listen\\()`,
    'm'
  );
  const rest = src.slice(afterCreate);
  const routeMatch = rest.match(routeRe);
  if (!routeMatch) return 'manual';
  const routeAt = afterCreate + routeMatch.index;

  const requireLine = isEsm ? "import createMonemee from 'monemee-node';" : "const createMonemee = require('monemee-node');";
  const createBlock = [
    '',
    `${indent}// Monemee: checkout, unlock after purchase, access checks (npx monemee init)`,
    `${indent}const monemee = createMonemee({`,
    `${indent}  getRef: (req) => req.user?.id, // TODO: user ID from your login${login === 'token' ? ' (verify the token from req.headers.authorization)' : ''}`,
    `${indent}});`,
    `${indent}${app}.use(monemee.webhook()); // before express.json(): needs the raw body`,
    ''
  ].join('\n');
  const routesBlock = `${indent}${app}.use(monemee.routes()); // Monemee: /monemee/buy, /return, /access … (after your login)\n\n`;

  let out = src.slice(0, routeAt) + routesBlock + src.slice(routeAt);
  out = out.slice(0, afterCreate) + `\n${createBlock}` + out.slice(afterCreate);

  // Import nach dem letzten require/import am Dateianfang
  const head = [...out.matchAll(isEsm ? /^import .+;?\s*$/gm : /^(?:const|let|var) .+require\(.+\).*$/gm)];
  if (head.length) {
    const last = head[head.length - 1];
    const at = last.index + last[0].length;
    out = `${out.slice(0, at)}\n${requireLine}${out.slice(at)}`;
  } else {
    out = `${requireLine}\n${out}`;
  }
  fs.writeFileSync(file, out);
  return 'patched';
}

/** Next.js: lib/monemee.js + app/monemee/[...monemee]/route.js */
export function scaffoldNext(project) {
  const created = [];
  const root = project.serverDir;
  const libDir = fs.existsSync(path.join(root, 'src')) ? path.join(root, 'src', 'lib') : path.join(root, 'lib');
  const libFile = path.join(libDir, 'monemee.js');
  if (!fs.existsSync(libFile)) {
    fs.mkdirSync(libDir, { recursive: true });
    fs.writeFileSync(libFile, `import createMonemee from 'monemee-node';

// User ID from your login, e.g. with Auth.js: (await auth())?.user?.id
export const monemee = createMonemee({
  getRef: async (request) => null, // TODO
});
`);
    created.push(libFile);
  }
  const appDir = project.appDir || path.join(root, 'app');
  const routeFile = path.join(appDir, 'monemee', '[...monemee]', 'route.js');
  if (!fs.existsSync(routeFile)) {
    fs.mkdirSync(path.dirname(routeFile), { recursive: true });
    const rel = path.relative(path.dirname(routeFile), libFile).replace(/\\/g, '/').replace(/\.js$/, '');
    fs.writeFileSync(routeFile, `import { monemee } from '${rel.startsWith('.') ? rel : `./${rel}`}';

export const { GET, POST } = monemee.nextRoute();
`);
    created.push(routeFile);
  }
  return created;
}

/** React: fertige Upgrade-Komponente. */
export function scaffoldReactUpgrade(clientDir, { login, price }) {
  const dir = path.join(clientDir, 'src', 'components');
  const file = path.join(dir, 'MonemeeUpgrade.jsx');
  if (fs.existsSync(file)) return null;
  fs.mkdirSync(dir, { recursive: true });
  const headers = login === 'token'
    ? `\n  // Token login: send the login header, e.g. with Firebase:\n  // getHeaders={async () => ({ Authorization: \`Bearer \${await auth.currentUser.getIdToken()}\` })}`
    : '';
  fs.writeFileSync(file, `import { MonemeeProvider, AccessGate, BuyButton, LicenseForm, useAccess } from 'monemee-react';

/**
 * Pro area: renders children only after a purchase.
 * Usage: <MonemeeUpgrade><YourProFeature /></MonemeeUpgrade>${headers}
 *
 * Default texts of LicenseForm follow the browser language (English or German).
 * Pin them with <MonemeeProvider locale="en">.
 */
export default function MonemeeUpgrade({ children }) {
  return (
    <MonemeeProvider>
      <AccessGate loading={<p>Loading…</p>} fallback={<Paywall />}>
        {children}
      </AccessGate>
    </MonemeeProvider>
  );
}

function Paywall() {
  const { mode, testBuy } = useAccess();
  return (
    <div>
      <h2>Unlock Pro</h2>
      <BuyButton>Buy now${price ? ` – €${price}` : ''}</BuyButton>
      {mode === 'test' && (
        <button type="button" onClick={() => testBuy()}>Test purchase (no charge)</button>
      )}
      <details>
        <summary>Already bought? Enter your license key</summary>
        <LicenseForm />
      </details>
    </div>
  );
}
`);
  return file;
}
