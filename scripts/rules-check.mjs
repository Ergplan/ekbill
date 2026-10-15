#!/usr/bin/env node
// rules:check: the GST rule pack (I5) is versioned, sourced JSON. Every file
// under packages/engine/rules/ must parse, carry version, effectiveFrom and
// a source per entry, and no two files may claim the same version.
// Stage 0 ships the check; Stage 3 ships the first pack.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'packages/engine/rules/gst');
const MAX_UNVERIFIED = 3;

if (!existsSync(DIR)) {
  console.log('rules:check: no rule pack yet (packages/engine/rules/gst arrives in Stage 3)');
  process.exit(0);
}

const problems = [];
const unverified = [];
const versions = new Map();
for (const file of readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()) {
  let pack;
  try {
    pack = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
  } catch (error) {
    problems.push(`${file}: not JSON (${error.message})`);
    continue;
  }
  for (const key of ['version', 'effectiveFrom', 'entries']) {
    if (!(key in pack)) problems.push(`${file}: missing "${key}"`);
  }
  if (typeof pack.version === 'string') {
    if (versions.has(pack.version))
      problems.push(`${file}: version ${pack.version} already used by ${versions.get(pack.version)}`);
    versions.set(pack.version, file);
  }
  if (typeof pack.effectiveFrom === 'string' && Number.isNaN(Date.parse(pack.effectiveFrom))) {
    problems.push(`${file}: effectiveFrom "${pack.effectiveFrom}" is not a date`);
  }
  if (Array.isArray(pack.entries)) {
    pack.entries.forEach((entry, i) => {
      if (!entry.id) problems.push(`${file}: entry ${i} has no id`);
      if (!entry.source) problems.push(`${file}: entry ${entry.id ?? i} has no source`);
      if (!entry.effectiveFrom) problems.push(`${file}: entry ${entry.id ?? i} has no effectiveFrom`);
      if (!('verified' in entry)) problems.push(`${file}: entry ${entry.id ?? i} has no verified flag`);
      if (entry.verified && !entry.verifiedOn)
        problems.push(`${file}: entry ${entry.id ?? i} is verified without a date`);
      if (!entry.verified) unverified.push(`${file}: ${entry.id ?? i}`);
    });
  }
}

if (unverified.length > MAX_UNVERIFIED)
  problems.push(
    `${unverified.length} unverified entries; at most ${MAX_UNVERIFIED} allowed (I5): ${unverified.join(', ')}`,
  );
if (problems.length) {
  console.error('rules:check:');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(
  `rules:check: ${versions.size} pack(s) well-formed, ${unverified.length} unverified entr${unverified.length === 1 ? 'y' : 'ies'} (max ${MAX_UNVERIFIED})`,
);
