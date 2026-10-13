#!/usr/bin/env node
// Copy the design pack's font files into apps/web/public/fonts before dev and
// build (master prompt rule 7: only the font files are copied, everything
// else is imported from @ekbill/design). The copy is gitignored.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FROM = join(ROOT, 'design', 'fonts');
const TO = join(ROOT, 'apps', 'web', 'public', 'fonts');
mkdirSync(TO, { recursive: true });
let n = 0;
for (const f of readdirSync(FROM)) {
  if (!f.endsWith('.woff2')) continue;
  copyFileSync(join(FROM, f), join(TO, f));
  n += 1;
}
console.log(`copied ${n} font file(s) to apps/web/public/fonts`);
