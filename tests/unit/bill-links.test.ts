import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { paymentInput } from '../../apps/web/actions/schema';
import { billFileName, billPath, safeDecode } from '../../apps/web/screens/links';

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

  // Found by the Stage 11 review: a series without the year in its numbers starts again each April, so the number
  // alone named this year's INV-001 from every link to last year's (and money went to the wrong bill).
  it('carry the year the number belongs to, with any other query after it', () => {
    expect(billPath('INV-001', '', '2025-26')).toBe('/bills/INV-001?fy=2025-26');
    expect(billPath('INV-001', '/remind', '2025-26')).toBe('/bills/INV-001/remind?fy=2025-26');
    expect(billPath('INV-001', '', '2025-26', 'paid=1')).toBe('/bills/INV-001?fy=2025-26&paid=1');
    expect(billPath('INV-001', '', null, 'paid=1')).toBe('/bills/INV-001?paid=1');
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

  // Stage 11 review: "%" in a bill path (and 30 February in a payment) crashed the request with a 500.
  it('a broken escape is taken as written, and a day that does not exist is refused at the door', () => {
    expect(safeDecode('%')).toBe('%');
    expect(safeDecode('INV-2026-27%2F001')).toBe('INV-2026-27/001');
    const base = { documentId: '00000000-0000-4000-8000-000000000001', kind: 'payment', amount: '10', method: 'upi' };
    expect(paymentInput.safeParse({ ...base, date: '2026-02-30' }).success).toBe(false);
    expect(paymentInput.safeParse({ ...base, date: '2026-02-28' }).success).toBe(true);
  });
});
