import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { billFileName, billPath } from '../../apps/web/screens/links';

/**
 * Stage 11, found by the clean-clone run: a number with the financial year in it carries a slash
 * (INV-2026-27/001 is every new business's default), and the bill links put it in the path raw, so
 * every such bill's link was "Yeh mila nahi". Links and file names go through one helper each.
 */
describe('bill links', () => {
  it('put the whole number in one path segment, and the route reads it back', () => {
    expect(billPath('INV-2026-27/001')).toBe('/bills/INV-2026-27%2F001');
    expect(billPath('INV-2026-27/001', '/remind')).toBe('/bills/INV-2026-27%2F001/remind');
    expect(billPath('INV-042')).toBe('/bills/INV-042');
    expect(decodeURIComponent(billPath('A B/7#?').split('/')[2]!)).toBe('A B/7#?');
  });

  it('name files without a slash', () => {
    expect(billFileName('INV-2026-27/001', 'pdf')).toBe('INV-2026-27-001.pdf');
    expect(billFileName('INV-042', 'jpg')).toBe('INV-042.jpg');
  });

  it('are never built raw: no `/bills/${…}` in the product source but through billPath or encodeURIComponent', () => {
    const root = join(__dirname, '../..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === '.next' || name === 'dist') continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts')) files.push(p);
      }
    };
    for (const dir of ['apps/web', 'apps/worker/src', 'packages']) walk(join(root, dir));
    const raw = files.flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, at: `${relative(root, f)}:${i + 1}` }))
        .filter(({ line }) => /\/bills\/\$\{(?!encodeURIComponent\()/.test(line)),
    );
    expect(raw.map((r) => r.at)).toEqual([]);
  });
});
