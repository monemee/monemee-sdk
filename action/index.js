'use strict';
/**
 * Monemee Release – GitHub Action ohne Abhängigkeiten.
 * 1. POST /public/uploads/sign  → signierte Upload-URL
 * 2. PUT  Datei an die Upload-URL
 * 3. POST /public/uploads/finalize
 * 4. PUT  /public/products/:id/file → ersetzt die Datei im bestehenden Modul
 */
const fs = require('fs');
const path = require('path');

const FORBIDDEN = ['.exe', '.bat', '.cmd', '.sh', '.bash', '.php', '.html', '.htm', '.js', '.mjs', '.dll', '.so', '.dylib', '.ps1', '.vbs', '.wsf', '.msi'];
const TYPES = {
  '.zip': 'application/zip', '.gz': 'application/gzip', '.tgz': 'application/gzip', '.dmg': 'application/x-apple-diskimage',
  '.pdf': 'application/pdf', '.epub': 'application/epub+zip', '.json': 'application/json', '.txt': 'text/plain',
  '.md': 'text/markdown', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg'
};

function input(name) {
  return (process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] || '').trim();
}

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function mask(value) {
  if (value) process.stdout.write(`::add-mask::${value}\n`);
}

async function api(base, key, method, p, body) {
  const res = await fetch(`${base}/api/v1/public${p}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'monemee-action' },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) throw new Error(`${method} ${p}: ${json.message || `HTTP ${res.status}`}`);
  return json.data;
}

async function run() {
  const key = input('api-key');
  const productId = input('product-id');
  const file = input('file');
  const base = (input('base-url') || 'https://monemee.com').replace(/\/+$/, '');
  mask(key);

  if (!/^monemee_/.test(key)) throw new Error('api-key muss mit monemee_ beginnen (Monemee → Einstellungen → API-Keys)');
  if (!/^\d+$/.test(productId)) throw new Error('product-id muss eine Zahl sein');
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Datei nicht gefunden: ${file}`);

  const fileName = path.basename(file);
  const ext = fileName.toLowerCase().endsWith('.tar.gz') ? '.gz' : path.extname(fileName).toLowerCase();
  if (FORBIDDEN.includes(ext)) {
    throw new Error(`${ext}-Dateien werden aus Sicherheitsgründen nicht angenommen. Bitte als .zip verpacken.`);
  }
  const contentType = TYPES[ext] || 'application/octet-stream';
  const data = fs.readFileSync(file);

  console.log(`Monemee: lade ${fileName} (${(data.length / 1024 / 1024).toFixed(1)} MB) für Produkt #${productId} hoch …`);
  const signed = await api(base, key, 'POST', '/uploads/sign', { fileName, contentType });
  const put = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: data });
  if (!put.ok) throw new Error(`Upload fehlgeschlagen: HTTP ${put.status}`);
  const fin = await api(base, key, 'POST', '/uploads/finalize', { objectPath: signed.objectPath });
  const result = await api(base, key, 'PUT', `/products/${productId}/file`, {
    file_url: fin.fileUrl || signed.fileUrl,
    file_name: signed.fileName || fileName,
    file_size: data.length
  });

  setOutput('module-id', result.module_id);
  setOutput('file-url', fin.fileUrl || signed.fileUrl);
  console.log(result.replaced
    ? `✔ Neue Version ist live (Modul #${result.module_id}). Bisherige Käufer bekommen sie über ihre Links.`
    : `✔ Datei angelegt (Modul #${result.module_id}).`);
}

run().catch((err) => {
  process.stdout.write(`::error::${err.message}\n`);
  process.exitCode = 1;
});
