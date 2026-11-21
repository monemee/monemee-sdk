import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { baseUrl, readCredentials, writeCredentials } from './config.js';
import { login, accessToken } from './oauth.js';
import { publicApi, appApi, CliError } from './api.js';
import {
  detectProject, upsertEnv, readEnv, ensureGitignored,
  patchExpress, scaffoldNext, scaffoldReactUpgrade, EXPRESS_SNIPPET
} from './project.js';

const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

// ---------- Ausgabe ----------
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (color ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const blue = paint('34');
const dim = paint('2');
const bold = paint('1');
const ok = (msg) => console.log(`${blue('✔')} ${msg}`);
const info = (msg) => console.log(`${dim('→')} ${msg}`);
const warn = (msg) => console.log(`${paint('33')('!')} ${msg}`);

const HELP = `
${bold('monemee')} ${dim(`v${VERSION}`)} – verkaufe deine App über Monemee

${bold('Befehle')}
  init        Alles einrichten: Login, Produkt, .env, Code (Testmodus)
  test-buy    Testkauf ohne Geld (echter Ablauf bis zur Freischaltung)
  live        Live schalten: Rücksprung-URL, Live-Secret, Webhook
  doctor      Einrichtung prüfen
  login       Im Browser bei Monemee einloggen
  logout      Login auf diesem Rechner löschen
  whoami      Zeigt, mit welchem Konto die CLI verbunden ist

${bold('Optionen')}
  --yes             Fragen mit Standardwert beantworten
  --product <id>    Bestehendes Produkt verwenden
  --title <text>    Titel für ein neues Produkt
  --price <euro>    Preis für ein neues Produkt
  --url <https://>  (live) Adresse deiner Live-App
  --ref <id>        (test-buy) Nutzer-ID für den Testkauf
  --base-url <url>  Andere Monemee-Instanz (z. B. https://staging.monemee.com)

Doku: https://github.com/monemee/monemee-dev
`;

function parseArgs(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[k] = argv[++i];
      else flags[k] = true;
    } else rest.push(a);
  }
  return { command: rest[0] || 'help', args: rest.slice(1), flags };
}

function openBrowser(url) {
  if (process.env.MONEMEE_NO_BROWSER) return;
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch (_) { /* Link steht im Terminal */ }
}

function createAsk(flags) {
  let rl = null;
  const get = () => {
    if (!rl) rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return rl;
  };
  const ask = async (question, def = '') => {
    if (flags.yes || !process.stdin.isTTY) return def;
    const answer = (await get().question(`${blue('?')} ${question}${def ? dim(` (${def})`) : ''} `)).trim();
    return answer || def;
  };
  ask.confirm = async (question, def = true) => {
    const a = (await ask(`${question} ${dim(def ? '[J/n]' : '[j/N]')}`, def ? 'j' : 'n')).toLowerCase();
    return a.startsWith('j') || a.startsWith('y');
  };
  ask.close = () => rl && rl.close();
  return ask;
}

async function ensureLogin(base) {
  if (await accessToken(base)) return;
  info(`Noch nicht verbunden mit ${base}.`);
  await login(base, { openBrowser, log: info });
  ok('Mit Monemee verbunden');
}

function envFile(project) {
  return path.join(project.serverDir, '.env');
}

function rel(file) {
  return path.relative(process.cwd(), file) || '.';
}

// ---------- Befehle ----------

async function cmdLogin(flags) {
  const base = baseUrl(flags);
  await login(base, { openBrowser, log: info });
  const me = await publicApi(base).me();
  ok(`Verbunden als ${bold(me.email)} (${base})`);
}

async function cmdLogout(flags) {
  const base = baseUrl(flags);
  writeCredentials(base, null);
  ok(`Login für ${base} gelöscht. Die Freigabe kannst du in Monemee unter Einstellungen → Verbundene Apps widerrufen.`);
}

async function cmdWhoami(flags) {
  const base = baseUrl(flags);
  if (!readCredentials(base)) {
    info('Nicht eingeloggt. `npx monemee login`');
    return;
  }
  const me = await publicApi(base).me();
  ok(`${me.email} · ${base}`);
}

async function chooseProduct(api, flags, ask, project) {
  if (flags.product) return api.product(flags.product);

  const products = await api.products();
  const list = Array.isArray(products) ? products : products?.products || [];
  if (list.length && !flags.title) {
    console.log(`\n${bold('Deine Produkte')}`);
    list.slice(0, 20).forEach((p, i) => console.log(`  ${i + 1}) ${p.title} ${dim(`#${p.id} · ${p.price} € · ${p.status}`)}`));
    console.log(`  n) Neues Produkt anlegen`);
    const pick = await ask('Welches Produkt verkauft diese App?', 'n');
    const idx = Number(pick) - 1;
    if (Number.isInteger(idx) && list[idx]) return api.product(list[idx].id);
  }

  const pkg = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')); } catch (_) { return {}; }
  })();
  const title = flags.title || (await ask('Name des Produkts?', `${pkg.name || path.basename(process.cwd())} Pro`));
  const price = Number(String(flags.price || (await ask('Preis in Euro?', '9'))).replace(',', '.'));
  if (!Number.isFinite(price) || price <= 0) throw new CliError('Preis muss eine positive Zahl sein.');
  const created = await api.createProduct({
    frontend_type: 'link',
    title,
    price,
    description: `Zugang zu ${title}.`,
    status: 'draft',
    license_enabled: true
  });
  ok(`Produkt angelegt: ${bold(title)} für ${price} € ${dim(`(#${created.id}, Entwurf)`)}`);
  return created;
}

async function cmdInit(flags) {
  const base = baseUrl(flags);
  const ask = createAsk(flags);
  try {
    const project = detectProject(process.cwd());
    const label = { next: 'Next.js', express: 'Express', fastify: 'Fastify', python: 'Python', node: 'Node.js', unknown: 'unbekannt' }[project.framework];
    ok(`Projekt erkannt: ${bold(label)}${project.react ? ' + React' : ''} · Login per ${project.login === 'token' ? 'Token im Browser' : 'Session/Cookie'}`);

    await ensureLogin(base);
    const api = publicApi(base);

    let product = await chooseProduct(api, flags, ask, project);
    if (!product.license_enabled) {
      product = await api.updateProduct(product.id, { license_enabled: true });
      ok('Lizenzschlüssel für das Produkt aktiviert');
    }

    // Test-Secret: vorhandenes wiederverwenden, wenn es zu diesem Produkt gehört
    const file = envFile(project);
    const env = readEnv(file);
    let secret = env.MONEMEE_APP_SECRET;
    let reuse = false;
    if (secret && /^mmapp_test_/.test(secret)) {
      try {
        reuse = Number((await appApi(base, secret).me()).product_id) === Number(product.id);
      } catch (_) { reuse = false; }
    }
    if (!reuse) {
      secret = (await api.createAppSecret(product.id, 'test')).secret;
      ok('Test-Secret angelegt');
    }

    upsertEnv(file, {
      MONEMEE_APP_SECRET: secret,
      MONEMEE_PRODUCT_ID: product.id,
      ...(base !== 'https://monemee.com' ? { MONEMEE_BASE_URL: base } : {})
    });
    ok(`${rel(file)} ergänzt (MONEMEE_APP_SECRET, MONEMEE_PRODUCT_ID)`);
    if (ensureGitignored(project.serverDir)) ok('.env in .gitignore eingetragen');

    // Code
    const packages = [];
    if (project.framework === 'express') {
      packages.push({ dir: project.serverDir, name: '@monemee/node' });
      const result = project.serverEntry ? patchExpress(project.serverEntry, project.login) : 'manual';
      if (result === 'patched') ok(`${rel(project.serverEntry)}: Monemee eingebunden ${dim('(getRef anpassen – siehe TODO)')}`);
      else if (result === 'already') ok(`${rel(project.serverEntry)}: Monemee ist schon eingebunden`);
      else {
        warn('Server-Datei nicht eindeutig gefunden. Füge das hier nach `const app = express()` ein:');
        console.log(`\n${EXPRESS_SNIPPET(project.login)}\n`);
      }
    } else if (project.framework === 'next') {
      packages.push({ dir: project.serverDir, name: '@monemee/node @monemee/react' });
      for (const f of scaffoldNext(project)) ok(`${rel(f)} angelegt`);
    } else if (project.framework === 'python') {
      info('Python: Das Python-Paket folgt. Bis dahin: POST /api/v1/apps/access mit dem App-Secret (siehe Doku).');
    } else {
      packages.push({ dir: project.serverDir, name: '@monemee/node' });
      info('Kein Express/Next erkannt. Nutze monemee.routes() (Node-Middleware) oder monemee.handleRequest(request).');
    }
    if (project.react && project.framework !== 'next' && project.clientDir) {
      packages.push({ dir: project.clientDir, name: '@monemee/react' });
      const f = scaffoldReactUpgrade(project.clientDir, { login: project.login, price: product.price });
      if (f) ok(`${rel(f)} angelegt (Paywall mit Kauf-, Test- und Schlüssel-Knopf)`);
    }

    // Pakete
    for (const p of packages) {
      const cmd = `npm install ${p.name}`;
      if (flags['skip-install']) {
        info(`Bitte installieren: ${bold(cmd)} ${dim(`in ${rel(p.dir)}`)}`);
        continue;
      }
      if (await ask.confirm(`${cmd} in ${rel(p.dir)} ausführen?`)) {
        await new Promise((resolve) => {
          const child = spawn('npm', ['install', ...p.name.split(' ')], { cwd: p.dir, stdio: 'inherit', shell: process.platform === 'win32' });
          child.on('exit', (code) => {
            if (code === 0) ok(`${p.name} installiert`);
            else warn(`Installation fehlgeschlagen – bitte selbst ausführen: ${cmd}`);
            resolve();
          });
          child.on('error', () => { warn(`Bitte selbst ausführen: ${cmd}`); resolve(); });
        });
      }
    }

    console.log(`
${bold('Fertig – Testmodus aktiv.')}
  1. ${project.framework === 'express' || project.framework === 'next' ? 'getRef in der Monemee-Einbindung auf die Nutzer-ID deines Logins setzen' : 'Monemee in deinen Server einbinden (siehe Doku)'}
  2. App starten, einloggen, dann: ${bold('npx monemee test-buy')} ${dim('(Testkauf ohne Geld)')}
  3. Wenn alles klappt: ${bold('npx monemee live')}
`);
  } finally {
    ask.close();
  }
}

async function cmdTestBuy(flags) {
  const base = baseUrl(flags);
  const project = detectProject(process.cwd());
  const env = readEnv(envFile(project));
  const secret = env.MONEMEE_APP_SECRET;
  if (!secret) throw new CliError('Kein MONEMEE_APP_SECRET in .env – zuerst `npx monemee init`.');
  if (!secret.startsWith('mmapp_test_')) throw new CliError('Testkäufe gehen nur mit einem Test-Secret (mmapp_test_…).');
  const port = Number(flags.port || project.port || 3000);

  if (!flags.ref) {
    // Ohne ref: Die App kennt den eingeloggten Nutzer – Testkauf über deren Route starten
    const url = project.login === 'token'
      ? `http://localhost:${port}/`
      : `http://localhost:${port}/monemee/test-buy`;
    if (project.login === 'token') {
      info('Token-Login: Öffne die Paywall in deiner App und klicke „Testkauf (ohne Geld)“.');
      info(`Oder direkt: npx monemee test-buy --ref <deine-nutzer-id>`);
    } else {
      info(`Öffne ${bold(url)} – eingeloggt in deiner App. Danach bist du freigeschaltet.`);
    }
    openBrowser(url);
    return;
  }

  const returnUrl = project.login === 'token' ? `http://localhost:${port}/` : `http://localhost:${port}/monemee/return`;
  const { redirectUrl } = await appApi(base, secret).testClaim(String(flags.ref), returnUrl);
  ok(`Testkauf für ${bold(flags.ref)} bereit. Öffne (eingeloggt als dieser Nutzer):\n  ${redirectUrl}`);
  openBrowser(redirectUrl);
}

async function cmdLive(flags) {
  const base = baseUrl(flags);
  const ask = createAsk(flags);
  try {
    const project = detectProject(process.cwd());
    const env = readEnv(envFile(project));
    const productId = flags.product || env.MONEMEE_PRODUCT_ID;
    if (!productId) throw new CliError('Kein Produkt gefunden – zuerst `npx monemee init`.');
    await ensureLogin(base);
    const api = publicApi(base);
    const product = await api.product(productId);

    const rawUrl = flags.url || (await ask('Adresse deiner Live-App (https://…)?', product.return_url ? new URL(product.return_url).origin : ''));
    let origin;
    try {
      origin = new URL(rawUrl).origin;
    } catch (_) {
      throw new CliError('Bitte eine vollständige Adresse angeben, z. B. https://meine-app.de');
    }
    if (!origin.startsWith('https://')) throw new CliError('Live-Apps brauchen https://');

    const defaultReturn = project.login === 'token' ? '/' : '/monemee/return';
    const returnPath = flags['return-path'] || (await ask('Wohin nach dem Kauf?', defaultReturn));
    const returnUrl = new URL(returnPath, origin).toString();
    await api.updateProduct(product.id, { return_url: returnUrl });
    ok(`Rücksprung-URL: ${returnUrl}`);

    const live = await api.createAppSecret(product.id, 'live');
    let webhook = null;
    if (await ask.confirm('Webhook einrichten (Erstattungen sofort wirksam)?')) {
      try {
        webhook = await api.createWebhook({
          url: `${origin}/monemee/webhook`,
          events: ['license.created', 'license.revoked', 'license.activated'],
          description: 'monemee CLI'
        });
        ok(`Webhook: ${origin}/monemee/webhook`);
      } catch (err) {
        warn(`Webhook nicht angelegt (${err.message}). Später erneut: npx monemee live – ohne Webhook greifen Erstattungen nach spätestens 5 Minuten.`);
      }
    }

    console.log(`
${bold('In die Umgebungsvariablen deiner Live-App eintragen')} ${dim('(nur jetzt sichtbar):')}

  MONEMEE_APP_SECRET=${live.secret}
  MONEMEE_PRODUCT_ID=${product.id}${webhook ? `\n  MONEMEE_WEBHOOK_SECRET=${webhook.signing_secret}` : ''}${base !== 'https://monemee.com' ? `\n  MONEMEE_BASE_URL=${base}` : ''}
`);
    if (product.status !== 'active') {
      warn(`Das Produkt ist noch ein Entwurf. Veröffentlichen: ${base}/products/${product.id}/edit`);
    }
    info('Die lokale .env bleibt im Testmodus – so testest du weiter ohne Geld.');
  } finally {
    ask.close();
  }
}

async function cmdDoctor(flags) {
  const base = baseUrl(flags);
  const project = detectProject(process.cwd());
  const file = envFile(project);
  const env = readEnv(file);
  let problems = 0;
  const bad = (msg) => { problems += 1; warn(msg); };

  ok(`Projekt: ${project.framework}${project.react ? ' + React' : ''}, Login per ${project.login}`);
  if (readCredentials(base)) ok(`CLI verbunden mit ${base}`);
  else info('CLI nicht eingeloggt (nur für init/live nötig)');

  if (!fs.existsSync(file)) bad(`${rel(file)} fehlt – \`npx monemee init\``);
  const secret = env.MONEMEE_APP_SECRET;
  if (!secret) bad('MONEMEE_APP_SECRET fehlt');
  else if (!/^mmapp_(test|live)_[0-9A-Za-z]{32}$/.test(secret)) bad('MONEMEE_APP_SECRET hat ein ungültiges Format');
  else {
    try {
      const me = await appApi(env.MONEMEE_BASE_URL || base, secret).me();
      ok(`Secret gültig: ${bold(me.title)} #${me.product_id} · ${me.mode === 'test' ? 'Testmodus' : 'LIVE'}`);
      if (env.MONEMEE_PRODUCT_ID && Number(env.MONEMEE_PRODUCT_ID) !== Number(me.product_id)) bad('MONEMEE_PRODUCT_ID passt nicht zum Secret');
      if (!me.license_enabled) bad('Lizenzschlüssel sind für das Produkt aus');
      if (!me.return_url) info('Noch keine Rücksprung-URL (für Live nötig: `npx monemee live`)');
      else ok(`Rücksprung-URL: ${me.return_url}`);
      if (me.status !== 'active') info(`Produkt ist „${me.status}“ – echte Käufe erst nach dem Veröffentlichen`);
    } catch (err) {
      bad(`Secret wird nicht akzeptiert: ${err.message}`);
    }
  }
  const gitignore = path.join(project.serverDir, '.gitignore');
  const ignored = fs.existsSync(gitignore) && fs.readFileSync(gitignore, 'utf8').split('\n').some((l) => ['.env', '/.env'].includes(l.trim()));
  if (!ignored) {
    bad('.env steht nicht in .gitignore – Secrets könnten im Repo landen');
  }
  console.log(problems ? `\n${problems} Problem(e) gefunden.` : `\n${bold('Alles in Ordnung.')}`);
  if (problems) process.exitCode = 1;
}

export async function main(argv) {
  const { command, flags } = parseArgs(argv);
  const commands = {
    init: cmdInit,
    'test-buy': cmdTestBuy,
    live: cmdLive,
    doctor: cmdDoctor,
    login: cmdLogin,
    logout: cmdLogout,
    whoami: cmdWhoami
  };
  if (flags.version || command === 'version') {
    console.log(VERSION);
    return;
  }
  if (flags.help || command === 'help' || !commands[command]) {
    if (command !== 'help' && !flags.help) warn(`Unbekannter Befehl: ${command}`);
    console.log(HELP);
    return;
  }
  try {
    await commands[command](flags);
  } catch (err) {
    console.error(`\n${paint('31')('✖')} ${err instanceof CliError ? err.message : err.stack || err.message}`);
    process.exitCode = 1;
  }
}

export { parseArgs };
