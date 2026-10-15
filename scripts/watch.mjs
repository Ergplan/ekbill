#!/usr/bin/env node
// The watcher (master prompt 5.2). Runs the checks in order, stopping at the
// first red, on every save; writes .watch/status.json and .watch/log.
//
//   npm run watch            # watch the tree and re-run on change
//   npm run watch -- --once  # run once and exit non-zero on red (CI, pre-commit)
//
// Checks: eslint, prettier --check, tsc --noEmit (one root tsconfig covers
// every workspace), vitest unit for the changed package then the whole unit
// suite, drizzle-kit check, rules:check, tokens:check, trace:check,
// flow:check, and the integration suite when packages/db or apps/web/actions
// changed. Playwright, load and paid-model calls are @slow and not here.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, appendFileSync, writeFileSync, watch } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WATCH_DIR = join(ROOT, '.watch');
const STATUS = join(WATCH_DIR, 'status.json');
const LOG = join(WATCH_DIR, 'log');
const once = process.argv.includes('--once');
const DEBOUNCE_MS = 600;
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;

mkdirSync(WATCH_DIR, { recursive: true });

const IGNORED = /(^|[\\/])(node_modules|\.next|\.git|\.watch|dist|coverage|test-results|__screenshots__)([\\/]|$)/;
const WATCHED_EXT = /\.(ts|tsx|mts|mjs|js|css|json|sql|md|txt)$/;

function log(line) {
  const stamped = `${new Date().toISOString()} ${line}`;
  appendFileSync(LOG, `${stamped}\n`);
  console.log(line);
}

function run(name, cmd, args, env = {}) {
  const started = Date.now();
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', CI: '1', ...env },
    maxBuffer: 64 * 1024 * 1024,
  });
  const ms = Date.now() - started;
  const ok = r.status === 0;
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.replace(ANSI, '').trim();
  log(`${ok ? 'ok  ' : 'FAIL'} ${name} (${ms} ms)`);
  if (!ok) appendFileSync(LOG, `${out}\n`);
  return { name, ok, ms, out };
}

/** Which workspace a changed file belongs to, for the "changed package first" unit run. */
function packageOf(file) {
  const rel = relative(ROOT, file).split(sep);
  if ((rel[0] === 'packages' || rel[0] === 'apps') && rel[1]) return `${rel[0]}/${rel[1]}`;
  return null;
}

function checks(changed) {
  const pkgs = new Set(changed.map(packageOf).filter(Boolean));
  const touchesDb = changed.some((f) => /(^|[\\/])packages[\\/]db[\\/]|(^|[\\/])apps[\\/]web[\\/]actions[\\/]/.test(f));
  const list = [
    ['eslint', 'npx', ['eslint', '.']],
    ['prettier', 'npx', ['prettier', '--check', '.']],
    ['tsc', 'npx', ['tsc', '--noEmit', '-p', 'tsconfig.json']],
  ];
  for (const pkg of pkgs) {
    if (existsSync(join(ROOT, pkg)))
      list.push([`vitest unit ${pkg}`, 'npx', ['vitest', 'run', '--project', 'unit', '--passWithNoTests', pkg]]);
  }
  list.push(['vitest unit', 'npx', ['vitest', 'run', '--project', 'unit']]);
  list.push(['drizzle-kit check', 'npx', ['drizzle-kit', 'check', '--config', 'packages/db/drizzle.config.ts']]);
  list.push(['rules:check', 'node', ['--import', 'tsx', 'scripts/rules-check.mjs']]);
  list.push(['tokens:check', 'node', ['scripts/tokens-check.mjs']]);
  list.push(['copy:check', 'node', ['scripts/copy-build.mjs', '--check']]);
  list.push(['trace:check', 'node', ['scripts/trace.mjs', '--check']]);
  list.push(['flow:check', 'node', ['scripts/flow-map.mjs', '--check']]);
  list.push(['gen:check', 'node', ['scripts/gen-tests.mjs', '--check']]);
  if (touchesDb || once) list.push(['vitest integration', 'npx', ['vitest', 'run', '--project', 'integration']]);
  return list;
}

function runAll(changed) {
  const at = new Date().toISOString();
  log(
    `---- run at ${at}${
      changed.length
        ? ` (changed: ${changed
            .slice(0, 5)
            .map((f) => relative(ROOT, f))
            .join(', ')}${changed.length > 5 ? ', …' : ''})`
        : ''
    }`,
  );
  const results = [];
  let failed = [];
  for (const [name, cmd, args] of checks(changed)) {
    const r = run(name, cmd, args);
    results.push(r);
    if (!r.ok) {
      failed = [{ name: r.name, tail: r.out.split('\n').slice(-40).join('\n') }];
      break; // stop at the first red: fix it before the rest matters
    }
  }
  const status = {
    ok: failed.length === 0,
    failed,
    at: new Date().toISOString(),
    ran: results.map((r) => ({ name: r.name, ok: r.ok, ms: r.ms })),
  };
  writeFileSync(STATUS, `${JSON.stringify(status, null, 2)}\n`);
  log(status.ok ? 'GREEN' : `RED: ${failed[0].name}`);
  return status.ok;
}

if (once) {
  process.exit(runAll([]) ? 0 : 1);
}

let pending = new Set();
let timer = null;
let running = false;
let rerun = false;

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    if (running) {
      rerun = true;
      return;
    }
    running = true;
    const changed = [...pending];
    pending = new Set();
    try {
      runAll(changed);
    } finally {
      running = false;
      if (rerun) {
        rerun = false;
        schedule();
      }
    }
  }, DEBOUNCE_MS);
}

runAll([]);
log(`watching ${ROOT}`);
watch(ROOT, { recursive: true }, (_event, filename) => {
  if (!filename) return;
  const full = join(ROOT, filename.toString());
  if (IGNORED.test(full) || !WATCHED_EXT.test(full)) return;
  pending.add(full);
  schedule();
});
