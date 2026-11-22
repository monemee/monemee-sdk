import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { baseUrl, readCredentials, writeCredentials } from './config.js';
import { login, accessToken } from './oauth.js';
import { publicApi, appApi, CliError } from './api.js';
import { t, setLang } from './i18n.js';
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

const help = () => t('help', { b: bold, d: dim, version: VERSION });

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
    const hint = def ? t('confirm_hint_yes') : t('confirm_hint_no');
    const a = (await ask(`${question} ${dim(hint)}`, def ? t('confirm_default_yes') : 'n')).toLowerCase();
    return a.startsWith('j') || a.startsWith('y');
  };
  ask.close = () => rl && rl.close();
  return ask;
}

async function ensureLogin(base) {
  if (await accessToken(base)) return;
  info(t('not_connected', { base }));
  await login(base, { openBrowser, log: info });
  ok(t('connected'));
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
  ok(t('connected_as', { email: bold(me.email), base }));
}

async function cmdLogout(flags) {
  const base = baseUrl(flags);
  writeCredentials(base, null);
  ok(t('logout_done', { base }));
}

async function cmdWhoami(flags) {
  const base = baseUrl(flags);
  if (!readCredentials(base)) {
    info(t('not_logged_in_hint'));
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
    console.log(`\n${bold(t('your_products'))}`);
    list.slice(0, 20).forEach((p, i) => console.log(`  ${i + 1}) ${p.title} ${dim(`#${p.id} · ${p.price} € · ${p.status}`)}`));
    console.log(`  n) ${t('new_product_option')}`);
    const pick = await ask(t('ask_which_product'), 'n');
    const idx = Number(pick) - 1;
    if (Number.isInteger(idx) && list[idx]) return api.product(list[idx].id);
  }

  const pkg = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')); } catch (_) { return {}; }
  })();
  const title = flags.title || (await ask(t('ask_product_name'), `${pkg.name || path.basename(process.cwd())} Pro`));
  const price = Number(String(flags.price || (await ask(t('ask_price'), '9'))).replace(',', '.'));
  if (!Number.isFinite(price) || price <= 0) throw new CliError(t('price_invalid'));
  const created = await api.createProduct({
    frontend_type: 'link',
    title,
    price,
    description: t('product_description', { title }),
    status: 'draft',
    license_enabled: true
  });
  ok(t('product_created', { title: bold(title), price, meta: dim(t('product_created_meta', { id: created.id })) }));
  return created;
}

async function cmdInit(flags) {
  const base = baseUrl(flags);
  const ask = createAsk(flags);
  try {
    const project = detectProject(process.cwd());
    const label = { next: 'Next.js', express: 'Express', fastify: 'Fastify', python: 'Python', node: 'Node.js', unknown: t('framework_unknown') }[project.framework];
    ok(t('project_detected', { label: bold(label), react: project.react ? ' + React' : '', login: t(project.login === 'token' ? 'login_token' : 'login_cookie') }));

    await ensureLogin(base);
    const api = publicApi(base);

    let product = await chooseProduct(api, flags, ask, project);
    if (!product.license_enabled) {
      product = await api.updateProduct(product.id, { license_enabled: true });
      ok(t('license_enabled'));
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
      ok(t('test_secret_created'));
    }

    upsertEnv(file, {
      MONEMEE_APP_SECRET: secret,
      MONEMEE_PRODUCT_ID: product.id,
      ...(base !== 'https://monemee.com' ? { MONEMEE_BASE_URL: base } : {})
    });
    ok(t('env_updated', { file: rel(file) }));
    if (ensureGitignored(project.serverDir)) ok(t('gitignore_added'));

    // Code
    const packages = [];
    if (project.framework === 'express') {
      packages.push({ dir: project.serverDir, name: '@monemee/node' });
      const result = project.serverEntry ? patchExpress(project.serverEntry, project.login) : 'manual';
      if (result === 'patched') ok(t('express_patched', { file: rel(project.serverEntry), hint: dim(t('express_patched_hint')) }));
      else if (result === 'already') ok(t('express_already', { file: rel(project.serverEntry) }));
      else {
        warn(t('express_manual'));
        console.log(`\n${EXPRESS_SNIPPET(project.login)}\n`);
      }
    } else if (project.framework === 'next') {
      packages.push({ dir: project.serverDir, name: '@monemee/node @monemee/react' });
      for (const f of scaffoldNext(project)) ok(t('file_created', { file: rel(f) }));
    } else if (project.framework === 'python') {
      info(t('python_info'));
    } else {
      packages.push({ dir: project.serverDir, name: '@monemee/node' });
      info(t('no_framework'));
    }
    if (project.react && project.framework !== 'next' && project.clientDir) {
      packages.push({ dir: project.clientDir, name: '@monemee/react' });
      const f = scaffoldReactUpgrade(project.clientDir, { login: project.login, price: product.price });
      if (f) ok(t('react_created', { file: rel(f) }));
    }

    // Pakete
    for (const p of packages) {
      const cmd = `npm install ${p.name}`;
      if (flags['skip-install']) {
        info(t('please_install', { cmd: bold(cmd), where: dim(t('in_dir', { dir: rel(p.dir) })) }));
        continue;
      }
      if (await ask.confirm(t('confirm_install', { cmd, dir: rel(p.dir) }))) {
        await new Promise((resolve) => {
          const child = spawn('npm', ['install', ...p.name.split(' ')], { cwd: p.dir, stdio: 'inherit', shell: process.platform === 'win32' });
          child.on('exit', (code) => {
            if (code === 0) ok(t('installed', { name: p.name }));
            else warn(t('install_failed', { cmd }));
            resolve();
          });
          child.on('error', () => { warn(t('run_yourself', { cmd })); resolve(); });
        });
      }
    }

    console.log(`
${bold(t('done_title'))}
  1. ${t(project.framework === 'express' || project.framework === 'next' ? 'done_step1_wired' : 'done_step1_manual')}
  2. ${t('done_step2', { cmd: bold('npx monemee test-buy'), hint: dim(t('done_step2_hint')) })}
  3. ${t('done_step3', { cmd: bold('npx monemee live') })}
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
  if (!secret) throw new CliError(t('no_secret'));
  if (!secret.startsWith('mmapp_test_')) throw new CliError(t('test_secret_only'));
  const port = Number(flags.port || project.port || 3000);

  if (!flags.ref) {
    // Ohne ref: Die App kennt den eingeloggten Nutzer – Testkauf über deren Route starten
    const url = project.login === 'token'
      ? `http://localhost:${port}/`
      : `http://localhost:${port}/monemee/test-buy`;
    if (project.login === 'token') {
      info(t('token_paywall_hint'));
      info(t('token_direct'));
    } else {
      info(t('open_logged_in', { url: bold(url) }));
    }
    openBrowser(url);
    return;
  }

  const returnUrl = project.login === 'token' ? `http://localhost:${port}/` : `http://localhost:${port}/monemee/return`;
  const { redirectUrl } = await appApi(base, secret).testClaim(String(flags.ref), returnUrl);
  ok(t('test_buy_ready', { ref: bold(flags.ref), url: redirectUrl }));
  openBrowser(redirectUrl);
}

async function cmdLive(flags) {
  const base = baseUrl(flags);
  const ask = createAsk(flags);
  try {
    const project = detectProject(process.cwd());
    const env = readEnv(envFile(project));
    const productId = flags.product || env.MONEMEE_PRODUCT_ID;
    if (!productId) throw new CliError(t('no_product'));
    await ensureLogin(base);
    const api = publicApi(base);
    const product = await api.product(productId);

    const rawUrl = flags.url || (await ask(t('ask_live_url'), product.return_url ? new URL(product.return_url).origin : ''));
    let origin;
    try {
      origin = new URL(rawUrl).origin;
    } catch (_) {
      throw new CliError(t('invalid_url'));
    }
    if (!origin.startsWith('https://')) throw new CliError(t('https_required'));

    const defaultReturn = project.login === 'token' ? '/' : '/monemee/return';
    const returnPath = flags['return-path'] || (await ask(t('ask_return_path'), defaultReturn));
    const returnUrl = new URL(returnPath, origin).toString();
    await api.updateProduct(product.id, { return_url: returnUrl });
    ok(t('return_url', { url: returnUrl }));

    const live = await api.createAppSecret(product.id, 'live');
    let webhook = null;
    if (await ask.confirm(t('confirm_webhook'))) {
      try {
        webhook = await api.createWebhook({
          url: `${origin}/monemee/webhook`,
          events: ['license.created', 'license.revoked', 'license.activated'],
          description: 'monemee CLI'
        });
        ok(t('webhook_ok', { url: `${origin}/monemee/webhook` }));
      } catch (err) {
        warn(t('webhook_failed', { error: err.message }));
      }
    }

    console.log(`
${bold(t('live_env_title'))} ${dim(t('live_env_hint'))}

  MONEMEE_APP_SECRET=${live.secret}
  MONEMEE_PRODUCT_ID=${product.id}${webhook ? `\n  MONEMEE_WEBHOOK_SECRET=${webhook.signing_secret}` : ''}${base !== 'https://monemee.com' ? `\n  MONEMEE_BASE_URL=${base}` : ''}
`);
    if (product.status !== 'active') {
      warn(t('product_draft', { url: `${base}/products/${product.id}/edit` }));
    }
    info(t('local_env_test'));
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

  ok(t('doctor_project', { framework: project.framework, react: project.react ? ' + React' : '', login: project.login }));
  if (readCredentials(base)) ok(t('doctor_connected', { base }));
  else info(t('doctor_not_logged_in'));

  if (!fs.existsSync(file)) bad(t('doctor_env_missing', { file: rel(file) }));
  const secret = env.MONEMEE_APP_SECRET;
  if (!secret) bad(t('secret_missing'));
  else if (!/^mmapp_(test|live)_[0-9A-Za-z]{32}$/.test(secret)) bad(t('secret_format'));
  else {
    try {
      const me = await appApi(env.MONEMEE_BASE_URL || base, secret).me();
      ok(t('secret_valid', { title: bold(me.title), id: me.product_id, mode: t(me.mode === 'test' ? 'mode_test' : 'mode_live') }));
      if (env.MONEMEE_PRODUCT_ID && Number(env.MONEMEE_PRODUCT_ID) !== Number(me.product_id)) bad(t('product_id_mismatch'));
      if (!me.license_enabled) bad(t('licenses_off'));
      if (!me.return_url) info(t('no_return_url'));
      else ok(t('return_url', { url: me.return_url }));
      if (me.status !== 'active') info(t('product_status', { status: me.status }));
    } catch (err) {
      bad(t('secret_rejected', { error: err.message }));
    }
  }
  const gitignore = path.join(project.serverDir, '.gitignore');
  const ignored = fs.existsSync(gitignore) && fs.readFileSync(gitignore, 'utf8').split('\n').some((l) => ['.env', '/.env'].includes(l.trim()));
  if (!ignored) {
    bad(t('env_not_ignored'));
  }
  console.log(problems ? `\n${t('problems_found', { count: problems })}` : `\n${bold(t('all_good'))}`);
  if (problems) process.exitCode = 1;
}

export async function main(argv) {
  const { command, flags } = parseArgs(argv);
  if (typeof flags.lang === 'string') setLang(flags.lang);
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
    if (command !== 'help' && !flags.help) warn(t('unknown_command', { command }));
    console.log(help());
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
