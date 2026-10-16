import { describe, expect, it } from 'vitest';

import * as documents from '../../packages/db/src/repos/documents';
import { getPool } from '../../packages/db/src/pool';
import * as series from '../../packages/db/src/repos/series';
import { scopeFor, seeded } from './helpers';

/** I3: gapless per series per financial year, never reused; 50 concurrent issues on one series give exactly 1…50. */
const TODAY = '2026-10-15';
const draftIn = (seriesId: string, dateIso = TODAY): documents.DraftInput => ({
  seriesId,
  customer: { name: 'Walk-in', stateCode: '27' },
  dateIso,
  lines: [
    {
      description: 'Visit',
      quantityMilli: 1000,
      unitPricePaise: 50000,
      gstBp: 1800,
      taxRateChosen: true,
      hsnCode: null,
    },
  ],
});

describe('numbering (I3)', () => {
  seeded();

  it('50 concurrent issues on one fresh series produce exactly 1…50', async () => {
    const scope = await scopeFor('sharma', 'owner');
    const s = await series.createSeries(scope, {
      name: `Race ${Date.now()}`,
      kind: 'bill',
      prefix: 'RC-',
      padding: 2,
      includeFy: false,
    });
    const drafts = await Promise.all(Array.from({ length: 50 }, () => documents.createDraft(scope, draftIn(s.id))));
    const issued = await Promise.all(drafts.map((d) => documents.issueDocument(scope, { id: d.id, today: TODAY })));
    const numbers = issued.map((d) => d.number!).sort();
    expect(new Set(numbers).size).toBe(50);
    expect(numbers).toEqual(Array.from({ length: 50 }, (_, i) => `RC-${String(i + 1).padStart(2, '0')}`).sort());
    const after = await series.getSeries(scope, s.id);
    expect(after.nextNumber).toBe(51);
    expect(after.fy).toBe('2026-27');
  }, 60_000);

  // A year boundary no other test's figures depend on (gst.test.ts owns Sharma's Apr–Jun 2026).
  it('restarts at 1 when the financial year rolls over, and keeps the year in the number when asked', async () => {
    const scope = await scopeFor('sharma', 'owner');
    const s = await series.createSeries(scope, {
      name: `FY ${Date.now()}`,
      kind: 'bill',
      prefix: 'FY/',
      padding: 3,
      includeFy: true,
    });
    const march = await documents.issueDocument(scope, {
      id: (await documents.createDraft(scope, draftIn(s.id, '2025-03-31'))).id,
      today: '2025-03-31',
    });
    const marchAgain = await documents.issueDocument(scope, {
      id: (await documents.createDraft(scope, draftIn(s.id, '2025-03-31'))).id,
      today: '2025-03-31',
    });
    const april = await documents.issueDocument(scope, {
      id: (await documents.createDraft(scope, draftIn(s.id, '2025-04-01'))).id,
      today: '2025-04-01',
    });
    expect([march.number, marchAgain.number, april.number]).toEqual([
      'FY/2024-25/001',
      'FY/2024-25/002',
      'FY/2025-26/001',
    ]);
    expect([march.financialYear, april.financialYear]).toEqual(['2024-25', '2025-26']);
  });

  it('the next number only goes up, never below what was issued', async () => {
    const scope = await scopeFor('sharma', 'owner');
    const s = await series.createSeries(scope, {
      name: `Up ${Date.now()}`,
      kind: 'bill',
      prefix: 'UP-',
      padding: 3,
      includeFy: false,
    });
    await documents.issueDocument(scope, { id: (await documents.createDraft(scope, draftIn(s.id))).id, today: TODAY });
    await documents.issueDocument(scope, { id: (await documents.createDraft(scope, draftIn(s.id))).id, today: TODAY });
    await expect(series.updateSeries(scope, s.id, { nextNumber: 2 })).rejects.toMatchObject({
      problem: 'next-number-down',
    });
    const moved = await series.updateSeries(scope, s.id, { nextNumber: 100 });
    expect(moved.nextNumber).toBe(100);
    const next = await documents.issueDocument(scope, {
      id: (await documents.createDraft(scope, draftIn(s.id))).id,
      today: TODAY,
    });
    expect(next.number).toBe('UP-100');
    // The same number can never appear twice in a series and year (the unique index backs the lock).
    await expect(series.updateSeries(scope, s.id, { nextNumber: 100 })).rejects.toMatchObject({
      problem: 'next-number-down',
    });
  });

  it('a retired series takes no more bills, and a credit note never takes a bill number', async () => {
    const scope = await scopeFor('sharma', 'owner');
    const s = await series.createSeries(scope, {
      name: `Old ${Date.now()}`,
      kind: 'bill',
      prefix: 'OLD-',
      padding: 3,
      includeFy: false,
    });
    const draft = await documents.createDraft(scope, draftIn(s.id));
    await series.updateSeries(scope, s.id, { active: false });
    await expect(documents.issueDocument(scope, { id: draft.id, today: TODAY })).rejects.toMatchObject({
      code: 'series-inactive',
    });
    await expect(documents.createDraft(scope, draftIn(s.id))).rejects.toMatchObject({ code: 'series-inactive' });
    const cn = (await series.listSeries(scope, { kind: 'credit_note' }))[0]!;
    await expect(documents.createDraft(scope, draftIn(cn.id))).rejects.toMatchObject({ code: 'series-kind' });
    await expect(
      series.createSeries(scope, {
        name: 'Bad',
        kind: 'bill',
        prefix: 'TOO-LONG-PREFIX',
        padding: 3,
        includeFy: false,
      }),
    ).rejects.toMatchObject({ problem: 'prefix-length' });
  });

  // Found by the Stage 11 coverage run: series made in one transaction share created_at, and an update (a number
  // spent) moves a row in the heap, so ordering by created_at alone let the "first" series change between reads.
  it('lists series in the same order whatever is updated, when they were made at the same moment', async () => {
    const scope = await scopeFor('verma', 'owner');
    const a = await series.createSeries(scope, {
      name: `Tie A ${Date.now()}`,
      kind: 'bill',
      prefix: 'TA-',
      padding: 3,
      includeFy: false,
    });
    const b = await series.createSeries(scope, {
      name: `Tie B ${Date.now()}`,
      kind: 'bill',
      prefix: 'TB-',
      padding: 3,
      includeFy: false,
    });
    const pool = getPool();
    await pool.query('update series set created_at = $1 where id = any($2)', ['2026-01-01T00:00:00Z', [a.id, b.id]]);
    const ids = async () =>
      (await series.listSeries(scope, { kind: 'bill' })).map((s) => s.id).filter((id) => id === a.id || id === b.id);
    const first = await ids();
    for (let i = 0; i < 5; i += 1) {
      // Whichever is listed first is renamed (name is indexed, so the update is not HOT): its new row version goes
      // to the end of the heap and of the index, which is the order a tie on created_at came back in before.
      await pool.query("update series set name = name || '.' where id = $1", [first[0]]);
      expect(await ids()).toEqual(first);
    }
  });

  // Found by the Stage 11 review (a paper bill photographed late carries its own date).
  it("a bill dated in an earlier year continues that year's numbers and the series carries on", async () => {
    const scope = await scopeFor('sharma', 'owner');
    const s = await series.createSeries(scope, {
      name: `Back ${Date.now()}`,
      kind: 'bill',
      prefix: 'BK/',
      padding: 3,
      includeFy: true,
    });
    const at = async (date: string) =>
      (
        await documents.issueDocument(scope, {
          id: (await documents.createDraft(scope, draftIn(s.id, date))).id,
          today: TODAY,
        })
      ).number;
    expect(await at('2026-03-30')).toBe('BK/2025-26/001');
    expect(await at('2026-10-14')).toBe('BK/2026-27/001');
    expect(await at('2026-10-15')).toBe('BK/2026-27/002');
    // Back into the earlier year: it continues there, and this year carries on from where it was.
    expect(await at('2026-03-31')).toBe('BK/2025-26/002');
    expect(await at('2026-10-15')).toBe('BK/2026-27/003');
    expect(await at('2025-11-01')).toBe('BK/2025-26/003');
    expect(await at('2026-10-15')).toBe('BK/2026-27/004');
  });

  // Found by the Stage 11 review: a series without the year starts again each April, and links named a bill by its
  // number alone, so last year's YR-001 opened this year's (money and reminders went to the wrong bill).
  it('a number that repeats across years is found by its year; a prefix belongs to one series', async () => {
    const scope = await scopeFor('sharma', 'owner');
    const s = await series.createSeries(scope, {
      name: `Yr ${Date.now()}`,
      kind: 'bill',
      prefix: 'YR-',
      padding: 3,
      includeFy: false,
    });
    const at = async (date: string) =>
      documents.issueDocument(scope, {
        id: (await documents.createDraft(scope, draftIn(s.id, date))).id,
        today: TODAY,
      });
    const old = await at('2026-03-30');
    const now = await at('2026-10-15');
    expect([old.number, now.number]).toEqual(['YR-001', 'YR-001']);
    expect(await documents.findBill(scope, 'YR-001', '2025-26')).toBe(old.id);
    expect(await documents.findBill(scope, 'YR-001', '2026-27')).toBe(now.id);
    expect(await documents.findBill(scope, 'YR-001')).toBe(now.id); // no year: the newest, as before
    expect(await documents.findBill(scope, 'YR-001', '2024-25')).toBeNull();

    // Another series may not number with YR- too (it would give YR-001 again this year); with the year it may.
    await expect(
      series.createSeries(scope, {
        name: `Yr2 ${Date.now()}`,
        kind: 'bill',
        prefix: 'YR-',
        padding: 3,
        includeFy: false,
      }),
    ).rejects.toMatchObject({ problem: 'prefix-taken' });
    const other = await series.createSeries(scope, {
      name: `Yr3 ${Date.now()}`,
      kind: 'bill',
      prefix: 'YQ-',
      padding: 3,
      includeFy: false,
    });
    await expect(series.updateSeries(scope, other.id, { prefix: 'YR-' })).rejects.toMatchObject({
      problem: 'prefix-taken',
    });
    expect((await series.updateSeries(scope, other.id, { prefix: 'YR-', includeFy: true })).prefix).toBe('YR-');
    // Renaming a series keeps its own prefix.
    expect((await series.updateSeries(scope, s.id, { name: 'Yr renamed' })).prefix).toBe('YR-');
  });
});
