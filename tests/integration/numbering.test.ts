import { describe, expect, it } from 'vitest';

import * as documents from '../../packages/db/src/repos/documents';
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
      id: (await documents.createDraft(scope, draftIn(s.id, '2026-03-31'))).id,
      today: '2026-03-31',
    });
    const marchAgain = await documents.issueDocument(scope, {
      id: (await documents.createDraft(scope, draftIn(s.id, '2026-03-31'))).id,
      today: '2026-03-31',
    });
    const april = await documents.issueDocument(scope, {
      id: (await documents.createDraft(scope, draftIn(s.id, '2026-04-01'))).id,
      today: '2026-04-01',
    });
    expect([march.number, marchAgain.number, april.number]).toEqual([
      'FY/2025-26/001',
      'FY/2025-26/002',
      'FY/2026-27/001',
    ]);
    expect([march.financialYear, april.financialYear]).toEqual(['2025-26', '2026-27']);
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
});
