#!/usr/bin/env node
// Regenerate design/copy/<locale>.json (hi-Latn, en, hi, mr, ta) from
// design/copy/strings.json (one dictionary, five registers). `--check` fails
// when the per-language files are stale, a key lacks a register, or a register's
// {placeholders} differ from the English (invoice.* keys are English-only by
// design: the bill never speaks the app's languages).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'design', 'copy');
const check = process.argv.includes('--check');

const strings = JSON.parse(readFileSync(join(DIR, 'strings.json'), 'utf8'));
// The registers the app speaks (packages/copy LOCALES); the bill's keys (invoice.*) are English alone.
const LOCALES = ['hi-Latn', 'en', 'hi', 'mr', 'ta'];
const out = Object.fromEntries(LOCALES.map((l) => [l, {}]));
const problems = [];
const placeholders = (s) => [...new Set(s.match(/\{\w+\}/g) ?? [])].sort().join(',');
for (const [key, entry] of Object.entries(strings)) {
  if (key.startsWith('_')) continue;
  const english = entry.en;
  if (typeof english !== 'string' || !english) problems.push(`${key}: no en`);
  out.en[key] = english;
  if (key.startsWith('invoice.')) continue;
  for (const locale of LOCALES.filter((l) => l !== 'en')) {
    const text = entry[locale];
    if (typeof text !== 'string' || !text) problems.push(`${key}: no ${locale}`);
    // A register that drops or renames a {placeholder} shows the brace on screen.
    else if (placeholders(text) !== placeholders(english))
      problems.push(`${key}: ${locale} placeholders differ from en`);
    else out[locale][key] = text;
  }
}
if (problems.length) {
  console.error('copy: every key needs all five registers with the same {placeholders} (invoice.* only en):');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
let stale = [];
for (const locale of LOCALES) {
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
