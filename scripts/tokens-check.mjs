#!/usr/bin/env node
// tokens:check (master prompt 5.2), exact: in apps/web and packages/ui, any
// .css, .tsx or .ts file that contains a literal colour, a px radius, a
// literal shadow or a font-family fails, unless tokens-allow.txt lists its
// path with a reason. Layout pixel sizes are allowed.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCOPES = ['apps/web', 'packages/ui'];
const PATTERNS = [
  ['hex colour', /#[0-9a-fA-F]{3,8}\b/],
  ['rgb()/rgba()', /rgba?\(/],
  ['hsl()/hsla()', /hsla?\(/],
  ['px radius', /border-radius:[^;]*\d+px/],
  ['literal shadow', /box-shadow:(?!\s*(var\(|none\b|inset(\s+-?[\d.]+(px)?){2,4}\s+(var\(|color-mix\()))/],
  ['font-family', /font-family:/],
  ['px type size', /font-size:\s*\d/],
  ['literal font weight', /font-weight:\s*\d/],
];
const SKIP_DIR = /(^|\/)(node_modules|\.next|dist|coverage|public)(\/|$)/;

function allowList() {
  let text;
  try {
    text = readFileSync(join(ROOT, 'tokens-allow.txt'), 'utf8');
  } catch {
    return new Map();
  }
  const map = new Map();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [path, ...reason] = line.split(/\s+/);
    if (!reason.length) {
      console.error(`tokens-allow.txt: "${path}" has no reason`);
      process.exit(2);
    }
    map.set(path, reason.join(' '));
  }
  return map;
}

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(ROOT, full);
    if (SKIP_DIR.test(rel)) continue;
    const st = statSync(full);
    if (st.isDirectory()) yield* files(full);
    else if (/\.(css|tsx|ts)$/.test(entry)) yield full;
  }
}

const allow = allowList();
const findings = [];
for (const scope of SCOPES) {
  let dir;
  try {
    dir = join(ROOT, scope);
    statSync(dir);
  } catch {
    continue;
  }
  for (const file of files(dir)) {
    const rel = relative(ROOT, file);
    if (allow.has(rel)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const [label, re] of PATTERNS) {
        if (re.test(line)) findings.push(`${rel}:${i + 1}: ${label}: ${line.trim().slice(0, 100)}`);
      }
    });
  }
}

if (findings.length) {
  console.error(`tokens:check: ${findings.length} literal value(s) outside the tokens:`);
  for (const f of findings) console.error(`  ${f}`);
  console.error('Use var(--eb-…) from @ekbill/design, or list the file in tokens-allow.txt with a reason.');
  process.exit(1);
}
console.log(`tokens:check: clean (${allow.size} allowed file(s))`);
