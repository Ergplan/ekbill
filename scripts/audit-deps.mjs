#!/usr/bin/env node
// `npm audit` for the audit pack (Stage 11): the report, with when it was taken, into
// docs/audit/npm-audit.json; then `npm run audit:pack` writes its summary into DEPENDENCIES.md.
// It needs the npm registry; where the registry is out of reach it says so and changes nothing.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const r = spawnSync('npm', ['audit', '--json', '--omit=optional'], { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
let report;
try {
  report = JSON.parse(r.stdout);
} catch {
  console.error(
    `audit:deps: npm audit gave no report (${(r.stderr || '').trim().slice(0, 200) || `exit ${r.status}`})`,
  );
  process.exit(1);
}
if (report.error) {
  console.error(`audit:deps: ${report.error.summary ?? 'npm audit failed'}`);
  process.exit(1);
}
report.recordedAt = new Date().toISOString().slice(0, 10);
writeFileSync(join(ROOT, 'docs', 'audit', 'npm-audit.json'), `${JSON.stringify(report, null, 2)}\n`);
const v = report.metadata?.vulnerabilities ?? {};
console.log(
  `audit:deps: ${Object.entries(v)
    .map(([k, n]) => `${k} ${n}`)
    .join(', ')}`,
);
