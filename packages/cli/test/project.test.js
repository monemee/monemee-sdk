import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectProject, upsertEnv, readEnv, ensureGitignored, patchExpress, scaffoldNext, scaffoldReactUpgrade } from '../src/project.js';
import { parseArgs } from '../src/main.js';

function tmp(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'monemee-cli-'));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

test('erkennt Express + React mit Firebase-Login (Monorepo server/ + client/)', () => {
  const dir = tmp({
    'server/package.json': { dependencies: { express: '^4' } },
    'server/index.js': "const express = require('express');\nconst app = express();\napp.listen(process.env.PORT || 5000);\n",
    'client/package.json': { dependencies: { react: '^18', firebase: '^10' } }
  });
  const p = detectProject(dir);
  assert.equal(p.framework, 'express');
  assert.equal(p.serverDir, path.join(dir, 'server'));
  assert.equal(p.clientDir, path.join(dir, 'client'));
  assert.equal(p.login, 'token');
  assert.equal(p.serverEntry, path.join(dir, 'server/index.js'));
  assert.equal(p.port, 5000);
});

test('erkennt Next.js (app/ unter src/) und Cookie-Login', () => {
  const dir = tmp({ 'package.json': { dependencies: { next: '15', react: '19', 'next-auth': '5' } }, 'src/app/page.js': '' });
  const p = detectProject(dir);
  assert.equal(p.framework, 'next');
  assert.equal(p.login, 'cookie');
  assert.equal(p.appDir, path.join(dir, 'src/app'));
});

test('erkennt Python', () => {
  assert.equal(detectProject(tmp({ 'requirements.txt': 'flask' })).framework, 'python');
});

test('.env: ergänzt und ersetzt, lässt Rest stehen; .gitignore wird ergänzt', () => {
  const dir = tmp({ '.env': 'DB=postgres\nMONEMEE_APP_SECRET=alt' });
  const file = path.join(dir, '.env');
  upsertEnv(file, { MONEMEE_APP_SECRET: 'neu', MONEMEE_PRODUCT_ID: 5 });
  assert.equal(fs.readFileSync(file, 'utf8'), 'DB=postgres\nMONEMEE_APP_SECRET=neu\nMONEMEE_PRODUCT_ID=5\n');
  assert.deepEqual(readEnv(file), { DB: 'postgres', MONEMEE_APP_SECRET: 'neu', MONEMEE_PRODUCT_ID: '5' });
  assert.equal(ensureGitignored(dir), true);
  assert.equal(ensureGitignored(dir), false);
  assert.equal(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), '.env\n');
});

test('patchExpress (CommonJS): webhook vor express.json, routes nach Login und vor erster Route', () => {
  const dir = tmp({
    'server.js': [
      "const express = require('express');",
      "const cors = require('cors');",
      '',
      'const app = express();',
      'app.use(express.json());',
      'app.use(session());',
      "app.get('/', (req, res) => res.send('hi'));",
      'app.listen(3000);',
      ''
    ].join('\n')
  });
  const file = path.join(dir, 'server.js');
  assert.equal(patchExpress(file, 'cookie'), 'patched');
  const src = fs.readFileSync(file, 'utf8');
  const at = (s) => src.indexOf(s);
  assert.ok(at("require('monemee-node')") > at("require('cors')"));
  assert.ok(at('app.use(monemee.webhook())') < at('app.use(express.json())'));
  assert.ok(at('app.use(monemee.routes())') > at('app.use(session())'));
  assert.ok(at('app.use(monemee.routes())') < at("app.get('/'"));
  assert.equal(patchExpress(file, 'cookie'), 'already');
  assert.equal(fs.readFileSync(file, 'utf8'), src);
  assert.doesNotMatch(src, /[äöüß]/);
});

test('patchExpress: keine Route erkennbar → manual, Datei unverändert', () => {
  const original = "const express = require('express');\nconst app = express();\nmodule.exports = app;\n";
  const dir = tmp({ 'server.js': original });
  assert.equal(patchExpress(path.join(dir, 'server.js'), 'cookie'), 'manual');
  assert.equal(fs.readFileSync(path.join(dir, 'server.js'), 'utf8'), original);
});

test('patchExpress (ESM) nutzt import', () => {
  const dir = tmp({ 'server.js': "import express from 'express';\nconst app = express();\napp.use('/api', api);\n" });
  const file = path.join(dir, 'server.js');
  assert.equal(patchExpress(file, 'token'), 'patched');
  const src = fs.readFileSync(file, 'utf8');
  assert.match(src, /import createMonemee from 'monemee-node';/);
  assert.match(src, /verify the token from req\.headers\.authorization/);
  assert.doesNotMatch(src, /[äöüß]/);
});

test('patchExpress: mehrdeutig → manual, Datei unverändert', () => {
  const original = "const express = require('express');\nconst app = express();\nconst admin = express();\n";
  const dir = tmp({ 'server.js': original });
  assert.equal(patchExpress(path.join(dir, 'server.js'), 'cookie'), 'manual');
  assert.equal(fs.readFileSync(path.join(dir, 'server.js'), 'utf8'), original);
});

test('scaffoldNext legt lib + Route an (relativer Import stimmt)', () => {
  const dir = tmp({ 'package.json': { dependencies: { next: '15' } }, 'app/page.js': '' });
  const files = scaffoldNext(detectProject(dir));
  assert.equal(files.length, 2);
  const route = fs.readFileSync(path.join(dir, 'app/monemee/[...monemee]/route.js'), 'utf8');
  assert.match(route, /from '\.\.\/\.\.\/\.\.\/lib\/monemee'/);
  assert.deepEqual(scaffoldNext(detectProject(dir)), []);
});

test('scaffoldReactUpgrade mit Preis und Token-Hinweis, überschreibt nichts', () => {
  const dir = tmp({});
  const file = scaffoldReactUpgrade(dir, { login: 'token', price: 19 });
  const src = fs.readFileSync(file, 'utf8');
  assert.match(src, /Buy now – €19/);
  assert.match(src, /Test purchase \(no charge\)/);
  assert.doesNotMatch(src, /[äöüß]|Jetzt|Testkauf/);
  assert.match(src, /getIdToken/);
  assert.equal(scaffoldReactUpgrade(dir, { login: 'token', price: 19 }), null);
});

test('parseArgs', () => {
  assert.deepEqual(parseArgs(['init', '--yes', '--price', '9', '--base-url=http://x']), {
    command: 'init', args: [], flags: { yes: true, price: '9', 'base-url': 'http://x' }
  });
});
