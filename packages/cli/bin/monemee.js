#!/usr/bin/env node
import { main } from '../src/main.js';
import { t, setLang } from '../src/i18n.js';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 18 || (major === 18 && minor < 17)) {
  const i = process.argv.indexOf('--lang');
  const flag = i > -1 ? process.argv[i + 1] : (process.argv.find((a) => a.startsWith('--lang=')) || '').slice(7);
  if (flag) setLang(flag);
  console.error(t('node_too_old'));
  process.exit(1);
}

main(process.argv.slice(2));
