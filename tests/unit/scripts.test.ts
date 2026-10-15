import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const run = (script: string, args: string[] = [], env: Record<string, string> = {}) => {
  try {
    // The seed loads TypeScript (the schema), so it runs with tsx the way `npm run seed` does.
    const nodeArgs = script === 'seed.mjs' ? ['--import', 'tsx'] : [];
    const out = execFileSync('node', [...nodeArgs, join(ROOT, 'scripts', script), ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (error) {
    const e = error as { status: number; stdout: string; stderr: string };
    return { code: e.status, out: `${e.stdout}${e.stderr}` };
  }
};

describe('tokens:check', () => {
  it('passes on the kit', () => {
    expect(run('tokens-check.mjs').code).toBe(0);
  });
});

describe('rules:check', () => {
  it('passes with no rule pack yet', () => {
    const r = run('rules-check.mjs');
    expect(r.code).toBe(0);
  });
});

describe('trace:check and flow:check', () => {
  it('agree with the committed documents', () => {
    expect(run('trace.mjs', ['--check']).code).toBe(0);
    expect(run('flow-map.mjs', ['--check']).code).toBe(0);
  });
});

describe('seed', () => {
  it('refuses a database that is not dev or test', () => {
    const r = run('seed.mjs', [], { DATABASE_URL: 'postgres://x@h/ekbill' });
    expect(r.code).toBe(1);
    expect(r.out).toContain('refusing');
  });
  it('accepts a dev database', () => {
    const r = run('seed.mjs', ['--dry'], { DATABASE_URL: 'postgres://x@h/ekbill2_dev' });
    expect(r.code).toBe(0);
    expect(r.out).toContain('would seed');
  });
});
