'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

function run(env) {
  return new Promise((resolve) => {
    execFile('node', [path.join(__dirname, '..', 'index.js')], { env: { ...process.env, ...env } }, (err, stdout) => resolve({ code: err ? err.code : 0, stdout }));
  });
}

test('Release: sign → PUT → finalize → Datei im Modul ersetzen, Outputs gesetzt', async () => {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    let body = Buffer.alloc(0);
    for await (const c of req) body = Buffer.concat([body, c]);
    calls.push({ method: req.method, url: req.url, auth: req.headers.authorization, type: req.headers['content-type'], body });
    const json = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true, data: o })); };
    const base = `http://127.0.0.1:${server.address().port}`;
    if (req.url === '/api/v1/public/uploads/sign') return json({ uploadUrl: `${base}/upload/abc`, fileUrl: 'https://storage/x/app.zip', objectPath: 'products/api/1/app.zip', fileName: 'app-1.2.zip' });
    if (req.url === '/upload/abc') { res.writeHead(200); return res.end(); }
    if (req.url === '/api/v1/public/uploads/finalize') return json({ fileUrl: 'https://storage/x/app.zip' });
    if (req.url === '/api/v1/public/products/77/file') return json({ module_id: 5, replaced: true });
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-action-'));
  const file = path.join(dir, 'app-1.2.zip');
  fs.writeFileSync(file, 'ZIPDATA');
  const out = path.join(dir, 'out');
  try {
    const r = await run({ 'INPUT_API-KEY': 'monemee_secret', 'INPUT_PRODUCT-ID': '77', INPUT_FILE: file, 'INPUT_BASE-URL': `http://127.0.0.1:${server.address().port}`, GITHUB_OUTPUT: out });
    assert.equal(r.code, 0, r.stdout);
    assert.match(r.stdout, /::add-mask::monemee_secret/);
    assert.match(r.stdout, /Neue Version ist live/);
    const upload = calls.find((c) => c.url === '/upload/abc');
    assert.equal(upload.type, 'application/zip');
    assert.equal(upload.body.toString(), 'ZIPDATA');
    assert.equal(upload.auth, undefined); // Secret geht nicht an den Speicher
    const replace = calls.find((c) => c.url.endsWith('/products/77/file'));
    assert.equal(replace.method, 'PUT');
    assert.deepEqual(JSON.parse(replace.body), { file_url: 'https://storage/x/app.zip', file_name: 'app-1.2.zip', file_size: 7 });
    assert.equal(fs.readFileSync(out, 'utf8'), 'module-id=5\nfile-url=https://storage/x/app.zip\n');
  } finally {
    server.close();
  }
});

test('verbotene Endung → verständlicher Fehler, kein Upload', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-action-'));
  const file = path.join(dir, 'setup.exe');
  fs.writeFileSync(file, 'x');
  const r = await run({ 'INPUT_API-KEY': 'monemee_x', 'INPUT_PRODUCT-ID': '1', INPUT_FILE: file, 'INPUT_BASE-URL': 'http://127.0.0.1:1' });
  assert.equal(r.code, 1);
  assert.match(r.stdout, /::error::.*als \.zip verpacken/);
});

test('falscher API-Key / fehlende Datei', async () => {
  assert.match((await run({ 'INPUT_API-KEY': 'falsch', 'INPUT_PRODUCT-ID': '1', INPUT_FILE: 'x' })).stdout, /monemee_/);
  assert.match((await run({ 'INPUT_API-KEY': 'monemee_x', 'INPUT_PRODUCT-ID': '1', INPUT_FILE: '/gibt/es/nicht.zip' })).stdout, /nicht gefunden/);
});
