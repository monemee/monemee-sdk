import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Zugangsdaten der CLI: ~/.config/monemee/credentials.json (0600). */

export function configDir() {
  if (process.env.MONEMEE_CONFIG_DIR) return process.env.MONEMEE_CONFIG_DIR;
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'monemee');
}

const file = () => path.join(configDir(), 'credentials.json');

export function baseUrl(flags = {}) {
  return String(flags['base-url'] || process.env.MONEMEE_BASE_URL || 'https://monemee.com').replace(/\/+$/, '');
}

/** Alle gespeicherten Logins, je Basis-URL (Prod und Staging getrennt). */
function readAll() {
  try {
    return JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch (_) {
    return {};
  }
}

export function readCredentials(base) {
  return readAll()[base] || null;
}

export function writeCredentials(base, creds) {
  const all = readAll();
  if (creds) all[base] = creds;
  else delete all[base];
  fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file(), JSON.stringify(all, null, 2), { mode: 0o600 });
  fs.chmodSync(file(), 0o600);
}
