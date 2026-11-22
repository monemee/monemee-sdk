/**
 * Sprache der CLI-Ausgaben: Englisch (Standard) oder Deutsch.
 * Reihenfolge: --lang de|en (setzt main.js per setLang), MONEMEE_LANG, LC_ALL, LC_MESSAGES, LANG,
 * dann die Systemsprache aus Intl. Beginnt der Wert mit "de" → Deutsch, sonst Englisch.
 */

function intlLocale() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || '';
  } catch (_) {
    return '';
  }
}

const normalize = (value) => (String(value).trim().toLowerCase().startsWith('de') ? 'de' : 'en');

/**
 * @param {{ flag?: string, env?: Record<string, string|undefined>, locale?: string }} [input]
 * @returns {'de'|'en'}
 */
export function detectLang({ flag, env = process.env, locale } = {}) {
  const candidates = [flag, env.MONEMEE_LANG, env.LC_ALL, env.LC_MESSAGES, env.LANG];
  const first = candidates.find((v) => typeof v === 'string' && v.trim() !== '');
  if (first !== undefined) return normalize(first);
  return normalize(locale !== undefined ? locale : intlLocale());
}

// eslint-disable-next-line import/no-mutable-exports
export let lang = detectLang();

/** Sprache fest setzen (z. B. aus --lang). Ungültige Werte → Englisch. */
export function setLang(value) {
  lang = normalize(value);
  return lang;
}

const en = {
  node_too_old: 'monemee requires Node.js 18.17 or newer.',

  // Hilfe
  help: ({ b, d, version }) => `
${b('monemee')} ${d(`v${version}`)} – sell your app through Monemee

${b('Commands')}
  init        Set everything up: login, product, .env, code (test mode)
  test-buy    Free test purchase (real flow up to unlocking)
  live        Go live: return URL, live secret, webhook
  doctor      Check your setup
  login       Log in to Monemee in the browser
  logout      Delete the login on this machine
  whoami      Show which account the CLI is connected to

${b('Options')}
  --yes             Answer prompts with their default
  --product <id>    Use an existing product
  --title <text>    Title for a new product
  --price <euro>    Price for a new product
  --url <https://>  (live) Address of your live app
  --ref <id>        (test-buy) User ID for the test purchase
  --base-url <url>  Another Monemee instance (e.g. https://staging.monemee.com)
  --lang <en|de>    Output language (default: from MONEMEE_LANG or your system locale)

Docs: https://github.com/monemee/monemee-sdk
`,
  unknown_command: 'Unknown command: {command}',

  // Fragen
  confirm_hint_yes: '[Y/n]',
  confirm_hint_no: '[y/N]',
  confirm_default_yes: 'y',

  // Login
  not_connected: 'Not connected to {base} yet.',
  connected: 'Connected to Monemee',
  connected_as: 'Connected as {email} ({base})',
  logout_done: 'Login for {base} deleted. You can revoke access in Monemee under Settings → Connected apps.',
  not_logged_in_hint: 'Not logged in. `npx monemee login`',

  // Produkt
  your_products: 'Your products',
  new_product_option: 'Create a new product',
  ask_which_product: 'Which product does this app sell?',
  ask_product_name: 'Product name?',
  ask_price: 'Price in euros?',
  price_invalid: 'The price must be a positive number.',
  product_description: 'Access to {title}.',
  product_created: 'Product created: {title} for {price} € {meta}',
  product_created_meta: '(#{id}, draft)',

  // init
  framework_unknown: 'unknown',
  login_token: 'token in the browser',
  login_cookie: 'session/cookie',
  project_detected: 'Project detected: {label}{react} · login via {login}',
  license_enabled: 'License keys enabled for the product',
  test_secret_created: 'Test secret created',
  env_updated: '{file} updated (MONEMEE_APP_SECRET, MONEMEE_PRODUCT_ID)',
  gitignore_added: '.env added to .gitignore',
  express_patched: '{file}: Monemee wired in {hint}',
  express_patched_hint: '(adjust getRef, see TODO)',
  express_already: '{file}: Monemee is already wired in',
  express_manual: 'Could not identify the server file. Add this after `const app = express()`:',
  file_created: '{file} created',
  python_info: 'Python: pip install monemee, then use monemee.App(...) with the app secret. Guide: https://dev.monemee.com/web-apps',
  no_framework: 'No Express or Next.js detected. Use monemee.routes() (Node middleware) or monemee.handleRequest(request).',
  react_created: '{file} created (paywall with buy, test purchase and license key buttons)',
  please_install: 'Please install: {cmd} {where}',
  in_dir: 'in {dir}',
  confirm_install: 'Run {cmd} in {dir}?',
  installed: '{name} installed',
  install_failed: 'Installation failed – please run it yourself: {cmd}',
  run_yourself: 'Please run it yourself: {cmd}',
  done_title: 'Done – test mode is active.',
  done_step1_wired: 'Set getRef in the Monemee setup to the user ID from your login',
  done_step1_manual: 'Wire Monemee into your server (see docs)',
  done_step2: 'Start your app, log in, then: {cmd} {hint}',
  done_step2_hint: '(free test purchase)',
  done_step3: 'Once everything works: {cmd}',

  // test-buy
  no_secret: 'No MONEMEE_APP_SECRET in .env – run `npx monemee init` first.',
  test_secret_only: 'Test purchases only work with a test secret (mmapp_test_…).',
  token_paywall_hint: 'Token login: open the paywall in your app and click the test purchase button.',
  token_direct: 'Or directly: npx monemee test-buy --ref <your-user-id>',
  open_logged_in: 'Open {url} while logged in to your app. Afterwards you are unlocked.',
  test_buy_ready: 'Test purchase for {ref} is ready. Open (logged in as this user):\n  {url}',

  // live
  no_product: 'No product found – run `npx monemee init` first.',
  ask_live_url: 'Address of your live app (https://…)?',
  invalid_url: 'Please enter a full address, e.g. https://my-app.com',
  https_required: 'Live apps need https://',
  ask_return_path: 'Where should buyers land after the purchase?',
  return_url: 'Return URL: {url}',
  confirm_webhook: 'Set up a webhook (refunds take effect immediately)?',
  webhook_ok: 'Webhook: {url}',
  webhook_failed: 'Webhook not created ({error}). Try again later with npx monemee live – without a webhook, refunds take effect within 5 minutes.',
  live_env_title: 'Add these to the environment variables of your live app',
  live_env_hint: '(shown only now):',
  product_draft: 'The product is still a draft. Publish it: {url}',
  local_env_test: 'Your local .env stays in test mode, so you can keep testing without real money.',

  // doctor
  doctor_project: 'Project: {framework}{react}, login via {login}',
  doctor_connected: 'CLI connected to {base}',
  doctor_not_logged_in: 'CLI not logged in (only needed for init/live)',
  doctor_env_missing: '{file} is missing – `npx monemee init`',
  secret_missing: 'MONEMEE_APP_SECRET is missing',
  secret_format: 'MONEMEE_APP_SECRET has an invalid format',
  secret_valid: 'Secret valid: {title} #{id} · {mode}',
  mode_test: 'test mode',
  mode_live: 'LIVE',
  product_id_mismatch: 'MONEMEE_PRODUCT_ID does not match the secret',
  licenses_off: 'License keys are turned off for the product',
  no_return_url: 'No return URL yet (required for live: `npx monemee live`)',
  product_status: 'Product is “{status}” – real purchases only after publishing',
  secret_rejected: 'Secret was not accepted: {error}',
  env_not_ignored: '.env is not in .gitignore – secrets could end up in your repository',
  problems_found: '{count} problem(s) found.',
  all_good: 'All good.',

  // api.js
  unreachable: 'Cannot reach Monemee ({error}).',
  session_expired: 'Not logged in or login expired. Please run `npx monemee login`.',
  http_error: 'Monemee responded with HTTP {status}',
  not_logged_in: 'Not logged in. Please run `npx monemee login`.',

  // oauth.js
  login_timeout: 'Login cancelled (no approval within 5 minutes).',
  page_failed_title: 'Login failed',
  page_failed_text: 'Please run <code>npx monemee login</code> again in the terminal.',
  page_ok_title: 'Connected ✓',
  page_ok_text: 'You can close this window and return to the terminal.',
  access_denied: 'Access was denied.',
  login_invalid_response: 'Login failed (invalid response).',
  register_failed: 'Registration failed: {error}',
  browser_opens: 'Your browser will open to approve access. If it does not, open this link:\n  {url}'
};

const de = {
  node_too_old: 'monemee braucht Node.js 18.17 oder neuer.',

  help: ({ b, d, version }) => `
${b('monemee')} ${d(`v${version}`)} – verkaufe deine App über Monemee

${b('Befehle')}
  init        Alles einrichten: Login, Produkt, .env, Code (Testmodus)
  test-buy    Testkauf ohne Geld (echter Ablauf bis zur Freischaltung)
  live        Live schalten: Rücksprung-URL, Live-Secret, Webhook
  doctor      Einrichtung prüfen
  login       Im Browser bei Monemee einloggen
  logout      Login auf diesem Rechner löschen
  whoami      Zeigt, mit welchem Konto die CLI verbunden ist

${b('Optionen')}
  --yes             Fragen mit Standardwert beantworten
  --product <id>    Bestehendes Produkt verwenden
  --title <text>    Titel für ein neues Produkt
  --price <euro>    Preis für ein neues Produkt
  --url <https://>  (live) Adresse deiner Live-App
  --ref <id>        (test-buy) Nutzer-ID für den Testkauf
  --base-url <url>  Andere Monemee-Instanz (z. B. https://staging.monemee.com)
  --lang <en|de>    Sprache der Ausgaben (Standard: MONEMEE_LANG oder Systemsprache)

Doku: https://github.com/monemee/monemee-sdk
`,
  unknown_command: 'Unbekannter Befehl: {command}',

  confirm_hint_yes: '[J/n]',
  confirm_hint_no: '[j/N]',
  confirm_default_yes: 'j',

  not_connected: 'Noch nicht verbunden mit {base}.',
  connected: 'Mit Monemee verbunden',
  connected_as: 'Verbunden als {email} ({base})',
  logout_done: 'Login für {base} gelöscht. Die Freigabe kannst du in Monemee unter Einstellungen → Verbundene Apps widerrufen.',
  not_logged_in_hint: 'Nicht eingeloggt. `npx monemee login`',

  your_products: 'Deine Produkte',
  new_product_option: 'Neues Produkt anlegen',
  ask_which_product: 'Welches Produkt verkauft diese App?',
  ask_product_name: 'Name des Produkts?',
  ask_price: 'Preis in Euro?',
  price_invalid: 'Preis muss eine positive Zahl sein.',
  product_description: 'Zugang zu {title}.',
  product_created: 'Produkt angelegt: {title} für {price} € {meta}',
  product_created_meta: '(#{id}, Entwurf)',

  framework_unknown: 'unbekannt',
  login_token: 'Token im Browser',
  login_cookie: 'Session/Cookie',
  project_detected: 'Projekt erkannt: {label}{react} · Login per {login}',
  license_enabled: 'Lizenzschlüssel für das Produkt aktiviert',
  test_secret_created: 'Test-Secret angelegt',
  env_updated: '{file} ergänzt (MONEMEE_APP_SECRET, MONEMEE_PRODUCT_ID)',
  gitignore_added: '.env in .gitignore eingetragen',
  express_patched: '{file}: Monemee eingebunden {hint}',
  express_patched_hint: '(getRef anpassen – siehe TODO)',
  express_already: '{file}: Monemee ist schon eingebunden',
  express_manual: 'Server-Datei nicht eindeutig gefunden. Füge das hier nach `const app = express()` ein:',
  file_created: '{file} angelegt',
  python_info: 'Python: pip install monemee, dann monemee.App(...) mit dem App-Secret. Anleitung: https://dev.monemee.com/web-apps',
  no_framework: 'Kein Express/Next erkannt. Nutze monemee.routes() (Node-Middleware) oder monemee.handleRequest(request).',
  react_created: '{file} angelegt (Paywall mit Kauf-, Test- und Schlüssel-Knopf)',
  please_install: 'Bitte installieren: {cmd} {where}',
  in_dir: 'in {dir}',
  confirm_install: '{cmd} in {dir} ausführen?',
  installed: '{name} installiert',
  install_failed: 'Installation fehlgeschlagen – bitte selbst ausführen: {cmd}',
  run_yourself: 'Bitte selbst ausführen: {cmd}',
  done_title: 'Fertig – Testmodus aktiv.',
  done_step1_wired: 'getRef in der Monemee-Einbindung auf die Nutzer-ID deines Logins setzen',
  done_step1_manual: 'Monemee in deinen Server einbinden (siehe Doku)',
  done_step2: 'App starten, einloggen, dann: {cmd} {hint}',
  done_step2_hint: '(Testkauf ohne Geld)',
  done_step3: 'Wenn alles klappt: {cmd}',

  no_secret: 'Kein MONEMEE_APP_SECRET in .env – zuerst `npx monemee init`.',
  test_secret_only: 'Testkäufe gehen nur mit einem Test-Secret (mmapp_test_…).',
  token_paywall_hint: 'Token-Login: Öffne die Paywall in deiner App und klicke auf den Testkauf-Knopf.',
  token_direct: 'Oder direkt: npx monemee test-buy --ref <deine-nutzer-id>',
  open_logged_in: 'Öffne {url} – eingeloggt in deiner App. Danach bist du freigeschaltet.',
  test_buy_ready: 'Testkauf für {ref} bereit. Öffne (eingeloggt als dieser Nutzer):\n  {url}',

  no_product: 'Kein Produkt gefunden – zuerst `npx monemee init`.',
  ask_live_url: 'Adresse deiner Live-App (https://…)?',
  invalid_url: 'Bitte eine vollständige Adresse angeben, z. B. https://meine-app.de',
  https_required: 'Live-Apps brauchen https://',
  ask_return_path: 'Wohin nach dem Kauf?',
  return_url: 'Rücksprung-URL: {url}',
  confirm_webhook: 'Webhook einrichten (Erstattungen sofort wirksam)?',
  webhook_ok: 'Webhook: {url}',
  webhook_failed: 'Webhook nicht angelegt ({error}). Später erneut: npx monemee live – ohne Webhook greifen Erstattungen nach spätestens 5 Minuten.',
  live_env_title: 'In die Umgebungsvariablen deiner Live-App eintragen',
  live_env_hint: '(nur jetzt sichtbar):',
  product_draft: 'Das Produkt ist noch ein Entwurf. Veröffentlichen: {url}',
  local_env_test: 'Die lokale .env bleibt im Testmodus – so testest du weiter ohne Geld.',

  doctor_project: 'Projekt: {framework}{react}, Login per {login}',
  doctor_connected: 'CLI verbunden mit {base}',
  doctor_not_logged_in: 'CLI nicht eingeloggt (nur für init/live nötig)',
  doctor_env_missing: '{file} fehlt – `npx monemee init`',
  secret_missing: 'MONEMEE_APP_SECRET fehlt',
  secret_format: 'MONEMEE_APP_SECRET hat ein ungültiges Format',
  secret_valid: 'Secret gültig: {title} #{id} · {mode}',
  mode_test: 'Testmodus',
  mode_live: 'LIVE',
  product_id_mismatch: 'MONEMEE_PRODUCT_ID passt nicht zum Secret',
  licenses_off: 'Lizenzschlüssel sind für das Produkt aus',
  no_return_url: 'Noch keine Rücksprung-URL (für Live nötig: `npx monemee live`)',
  product_status: 'Produkt ist „{status}“ – echte Käufe erst nach dem Veröffentlichen',
  secret_rejected: 'Secret wird nicht akzeptiert: {error}',
  env_not_ignored: '.env steht nicht in .gitignore – Secrets könnten im Repo landen',
  problems_found: '{count} Problem(e) gefunden.',
  all_good: 'Alles in Ordnung.',

  unreachable: 'Monemee nicht erreichbar ({error}).',
  session_expired: 'Nicht eingeloggt oder Login abgelaufen. Bitte `npx monemee login` ausführen.',
  http_error: 'Monemee antwortete mit HTTP {status}',
  not_logged_in: 'Nicht eingeloggt. Bitte `npx monemee login` ausführen.',

  login_timeout: 'Login abgebrochen (5 Minuten ohne Freigabe).',
  page_failed_title: 'Login fehlgeschlagen',
  page_failed_text: 'Bitte im Terminal erneut <code>npx monemee login</code> ausführen.',
  page_ok_title: 'Verbunden ✓',
  page_ok_text: 'Du kannst dieses Fenster schließen und zum Terminal zurückkehren.',
  access_denied: 'Freigabe abgelehnt.',
  login_invalid_response: 'Login fehlgeschlagen (ungültige Antwort).',
  register_failed: 'Registrierung fehlgeschlagen: {error}',
  browser_opens: 'Browser öffnet sich zur Freigabe. Falls nicht, diesen Link öffnen:\n  {url}'
};

export const messages = { en, de };

/**
 * Text in der aktuellen Sprache. Platzhalter {name} werden aus vars ersetzt;
 * Funktionswerte bekommen vars direkt.
 */
export function t(key, vars = {}) {
  const value = messages[lang][key] ?? en[key];
  if (value === undefined) return key;
  if (typeof value === 'function') return value(vars);
  return value.replace(/\{(\w+)\}/g, (m, name) => (vars[name] !== undefined ? String(vars[name]) : m));
}
