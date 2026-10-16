import { describe, expect, it } from 'vitest';

import { gstOfLines } from '../../apps/web/screens/bill/gst-lines';

/** Stage 6 review: a redo or "Pichle jaisa hi" of a bill with mixed rates came back at the first line's rate. */
describe('gstOfLines', () => {
  it('lines at different rates come back per line', () => {
    expect(gstOfLines([5, 18], 18)).toEqual({ mode: 'perline', rate: 5, perLine: [5, 18] });
  });
  it('lines at one rate come back as one rate', () => {
    expect(gstOfLines([18, 18], 5)).toEqual({ mode: 'one', rate: 18, perLine: [] });
  });
  it('a line with no rate takes the business’s default, and none at all gives the default', () => {
    expect(gstOfLines([null, 5], 18)).toEqual({ mode: 'perline', rate: 18, perLine: [18, 5] });
    expect(gstOfLines([], 12)).toEqual({ mode: 'one', rate: 12, perLine: [] });
  });
});

describe('assessLinesOf (Stage 8 review)', () => {
  it('a blank first row leaves each line its own per-line rate', async () => {
    const { assessLinesOf } = await import('../../apps/web/screens/bill/compute');
    const lines = assessLinesOf(
      {
        lines: [
          { what: '', qty: '1', rate: '' },
          { what: 'Cement', qty: '1', rate: '100' },
        ],
        gst: { on: true, mode: 'perline', rate: 5, perLine: [5, 18] },
      },
      true,
      () => null,
    );
    expect(lines.map((l) => [l.description, l.gstBp])).toEqual([['Cement', 1800]]);
  });
});

describe('renamed (Stage 6 review)', () => {
  const draft = (customerName: string, customerState: string | null) => ({
    customer: null,
    customerName,
    customerState,
    lines: [],
    gst: { on: true, mode: 'one' as const, rate: 18, perLine: [] },
    series: 'INV',
    number: '1',
    date: '2026-10-16',
  });
  const lent = { name: 'Asha G', stateCode: '27' };

  it('a different name drops the State the added customer lent; their name brings it back', async () => {
    const { renamed } = await import('../../apps/web/screens/bill/compute');
    const other = renamed(draft('Asha G', '27'), 'Other', lent, null);
    expect(other).toMatchObject({ customerName: 'Other', customerState: null });
    expect(renamed(other, 'Asha G', lent, null)).toMatchObject({ customerName: 'Asha G', customerState: '27' });
  });

  it('a State the owner chose stays; with nothing lent the name is all that changes', async () => {
    const { renamed } = await import('../../apps/web/screens/bill/compute');
    expect(renamed(draft('Asha G', '09'), 'Other', lent, null).customerState).toBe('09');
    expect(renamed(draft('Asha', '27'), 'Asha G', null, null)).toMatchObject({
      customerName: 'Asha G',
      customerState: '27',
    });
  });
});
