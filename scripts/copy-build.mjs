#!/usr/bin/env node
// Regenerate design/copy/hi-Latn.json and design/copy/en.json from
// design/copy/strings.json (one dictionary, two registers). `--check` fails
// when the per-language files are stale or a key lacks a register (invoice.*
// keys are English-only by design: the bill never speaks Hinglish).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'design', 'copy');
const check = process.argv.includes('--check');

const strings = JSON.parse(readFileSync(join(DIR, 'strings.json'), 'utf8'));
const out = { 'hi-Latn': {}, en: {} };
const problems = [];
for (const [key, entry] of Object.entries(strings)) {
  if (key.startsWith('_')) continue;
  const english = entry.en;
  if (typeof english !== 'string' || !english) problems.push(`${key}: no en`);
  const hinglish = key.startsWith('invoice.') ? undefined : entry['hi-Latn'];
  if (!key.startsWith('invoice.') && (typeof hinglish !== 'string' || !hinglish)) problems.push(`${key}: no hi-Latn`);
  out.en[key] = english;
  if (hinglish !== undefined) out['hi-Latn'][key] = hinglish;
}
if (problems.length) {
  console.error('copy: every key needs both registers (invoice.* only en):');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
let stale = [];
for (const locale of ['hi-Latn', 'en']) {
  const file = join(DIR, `${locale}.json`);
  const text = `${JSON.stringify(out[locale], null, 2)}\n`;
  const current = (() => {
    try {
      return readFileSync(file, 'utf8');
    } catch {
      return '';
    }
  })();
  if (current !== text) {
    if (check) stale.push(`${locale}.json`);
    else writeFileSync(file, text);
  }
}
if (check && stale.length) {
  console.error(`copy:check: ${stale.join(', ')} out of date; run npm run copy:build`);
  process.exit(1);
}
console.log(`copy: ${Object.keys(out.en).length} keys${check ? ' current' : ' written'}`);
