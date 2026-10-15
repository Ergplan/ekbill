#!/usr/bin/env node
// Copy the Stage 1 screen references (design/screens/<theme>/NN-<id>.png,
// written by tests/e2e/screens.spec.ts) into apps/web/public/flow-thumbs so
// /flow can show them. Runs before dev and build; the copy is gitignored.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
for (const theme of ['narangi', 'harmony']) {
  const from = join(ROOT, 'design', 'screens', theme);
  const to = join(ROOT, 'apps', 'web', 'public', 'flow-thumbs', theme);
  if (!existsSync(from)) continue;
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from)) {
    const m = f.match(/^v2-(.+)\.png$/);
    if (!m) continue;
    copyFileSync(join(from, f), join(to, `${m[1]}.png`));
    n += 1;
  }
}
console.log(`copied ${n} flow thumbnail(s)`);
