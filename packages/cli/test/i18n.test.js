import test from 'node:test';
import assert from 'node:assert/strict';
import { detectLang, setLang, t } from '../src/i18n.js';
import { main } from '../src/main.js';

test('Erkennung: --lang vor MONEMEE_LANG vor LC_ALL/LC_MESSAGES/LANG vor Intl', () => {
  const env = { MONEMEE_LANG: 'en', LC_ALL: 'de_DE.UTF-8', LC_MESSAGES: 'de_DE.UTF-8', LANG: 'de_DE.UTF-8' };
  assert.equal(detectLang({ flag: 'de', env, locale: 'en-US' }), 'de');
  assert.equal(detectLang({ env, locale: 'de-DE' }), 'en');
  assert.equal(detectLang({ env: { LC_ALL: 'de_AT.UTF-8', LANG: 'en_US.UTF-8' }, locale: 'en-US' }), 'de');
  assert.equal(detectLang({ env: { LC_MESSAGES: 'en_GB.UTF-8', LANG: 'de_DE.UTF-8' }, locale: 'de-DE' }), 'en');
  assert.equal(detectLang({ env: { LANG: 'de_CH.UTF-8' }, locale: 'en-US' }), 'de');
  assert.equal(detectLang({ env: { LANG: '' }, locale: 'de-DE' }), 'de');
  assert.equal(detectLang({ env: {}, locale: 'en-US' }), 'en');
  assert.equal(detectLang({ env: { LANG: 'C.UTF-8' }, locale: 'de-DE' }), 'en');
  assert.equal(detectLang({ env: { MONEMEE_LANG: 'fr' }, locale: 'de-DE' }), 'en');
});

test('t(): Platzhalter, Sprache umschalten, unbekannter Schlüssel', () => {
  setLang('de');
  assert.equal(t('return_url', { url: 'https://x' }), 'Rücksprung-URL: https://x');
  assert.equal(t('confirm_hint_yes'), '[J/n]');
  setLang('en');
  assert.equal(t('return_url', { url: 'https://x' }), 'Return URL: https://x');
  assert.equal(t('confirm_hint_yes'), '[Y/n]');
  assert.equal(t('does_not_exist'), 'does_not_exist');
  assert.equal(setLang('xx'), 'en');
});

test('EN und DE haben dieselben Schlüssel', async () => {
  const { messages } = await import('../src/i18n.js');
  assert.deepEqual(Object.keys(messages.de).sort(), Object.keys(messages.en).sort());
});

async function captureHelp(argv) {
  const lines = [];
  const original = console.log;
  console.log = (...a) => lines.push(a.join(' '));
  try {
    await main(argv);
  } finally {
    console.log = original;
  }
  return lines.join('\n');
}

test('--lang setzt die Sprache der Hilfe (und steht in der Hilfe)', async () => {
  const de = await captureHelp(['help', '--lang', 'de']);
  assert.match(de, /Befehle/);
  assert.match(de, /--lang <en\|de>/);
  const en = await captureHelp(['help', '--lang=en']);
  assert.match(en, /Commands/);
  assert.match(en, /--lang <en\|de>/);
  const unknown = await captureHelp(['nope', '--lang', 'de']);
  assert.match(unknown, /Unbekannter Befehl: nope/);
  setLang('en');
});
