#!/usr/bin/env node
import { main } from '../src/main.js';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 18 || (major === 18 && minor < 17)) {
  console.error('monemee braucht Node.js 18.17 oder neuer.');
  process.exit(1);
}

main(process.argv.slice(2));
