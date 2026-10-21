import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Every script the operator runs on the VM parses (21 Oct: an apostrophe inside check-env.sh's single-quoted node
 * script had left it unable to run since the demo came in, and nothing said so).
 */
const DIRS = ['deploy/vm', 'scripts'];
const scripts = DIRS.flatMap((d) =>
  readdirSync(join(__dirname, '..', '..', d))
    .filter((f) => f.endsWith('.sh'))
    .map((f) => join(d, f)),
);

describe('the VM scripts', () => {
  it.each(scripts)('%s parses', (script) => {
    expect(() => execFileSync('bash', ['-n', join(__dirname, '..', '..', script)], { stdio: 'pipe' })).not.toThrow();
  });
});
