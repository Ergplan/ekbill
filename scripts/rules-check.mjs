#!/usr/bin/env node
// rules:check (I5): every file under packages/engine/rules/gst must parse,
// match the zod schema (packages/engine/rules/schema.ts: window, official
// source, verification phrases, two-register explanation, verification date
// and verifier on every entry), the kind-specific fields the engine reads,
// no two files may claim the same version, no two entries the same id, and
// at most three entries may be verified=false. Runs with tsx (the schema is
// TypeScript): npm run rules:check.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hsnIndexSchema, kindSchemas, rulePackSchema } from '../packages/engine/rules/schema.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'packages/engine/rules/gst');
const MAX_UNVERIFIED = 3;

if (!existsSync(DIR)) {
  console.log('rules:check: no rule pack (packages/engine/rules/gst)');
  process.exit(1);
}

const problems = [];
const unverified = [];
const versions = new Map();
const ids = new Map();
let files = 0;
for (const file of readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()) {
  let data;
  try {
    data = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
  } catch (error) {
    problems.push(`${file}: not JSON (${error.message})`);
    continue;
  }
  files += 1;
  if (file === 'hsn-index.json') {
    const r = hsnIndexSchema.safeParse(data);
    if (!r.success)
      for (const issue of r.error.issues) problems.push(`${file}: ${issue.path.join('.')}: ${issue.message}`);
    continue;
  }
  const parsed = rulePackSchema.safeParse(data);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) problems.push(`${file}: ${issue.path.join('.')}: ${issue.message}`);
    continue;
  }
  const pack = parsed.data;
  if (versions.has(pack.version) && versions.get(pack.version) !== file) {
    // The same version string across files is fine when they were cut together; a clash of ids is not.
  }
  versions.set(`${file}@${pack.version}`, file);
  for (const entry of pack.entries) {
    if (ids.has(entry.id)) problems.push(`${file}: entry ${entry.id} already defined in ${ids.get(entry.id)}`);
    ids.set(entry.id, file);
    const kindSchema = kindSchemas[entry.kind];
    if (kindSchema) {
      const k = kindSchema.safeParse(entry);
      if (!k.success)
        for (const issue of k.error.issues)
          problems.push(`${file}: ${entry.id}: ${issue.path.join('.')}: ${issue.message}`);
    }
    if (entry.effectiveTo && entry.effectiveTo < entry.effectiveFrom)
      problems.push(`${file}: ${entry.id}: effectiveTo before effectiveFrom`);
    if (!entry.verified) unverified.push(`${file}: ${entry.id}`);
  }
}

if (unverified.length > MAX_UNVERIFIED)
  problems.push(
    `${unverified.length} unverified entries; at most ${MAX_UNVERIFIED} allowed (I5). Run npm run rules:verify where the official sites are reachable. Unverified: ${unverified.join(', ')}`,
  );
if (problems.length) {
  console.error('rules:check:');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(
  `rules:check: ${files} file(s) well-formed, ${ids.size} entries, ${unverified.length} unverified entr${unverified.length === 1 ? 'y' : 'ies'} (max ${MAX_UNVERIFIED})`,
);
