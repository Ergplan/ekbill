import { describe, expect, it } from 'vitest';

import { compute, taxLines } from '../../apps/web/screens/bill/compute';

const gst = { on: true, mode: 'one' as const, rate: 18, perLine: [] };

describe('bill draft arithmetic (integer paise)', () => {
  it('sums lines and adds one GST rate on everything for a regular business', () => {
    const c = compute(
      {
        lines: [
          { what: 'AMC', qty: '1', rate: '3500' },
          { what: 'Fan', qty: '2', rate: '1350' },
        ],
        gst,
      },
      'regular',
    );
    expect(c.subtotalPaise).toBe(620000);
    expect(c.gstPaise).toBe(111600);
    expect(c.totalPaise).toBe(731600);
  });
  it('applies per-line rates when asked', () => {
    const c = compute(
      {
        lines: [
          { what: 'A', qty: '1', rate: '100' },
          { what: 'B', qty: '1', rate: '100' },
        ],
        gst: { ...gst, mode: 'perline', perLine: [5, 18] },
      },
      'regular',
    );
    expect(c.lines.map((l) => l.gstPaise)).toEqual([500, 1800]);
  });
  it('never taxes a composition business or a bill with GST switched off', () => {
    expect(compute({ lines: [{ what: 'A', qty: '1', rate: '100' }], gst }, 'composition').gstPaise).toBe(0);
    expect(
      compute({ lines: [{ what: 'A', qty: '1', rate: '100' }], gst: { ...gst, on: false } }, 'regular').gstPaise,
    ).toBe(0);
  });
  it('treats an unparsable field as zero instead of NaN', () => {
    const c = compute({ lines: [{ what: 'A', qty: 'two', rate: '1,350' }], gst }, 'regular');
    expect(c.totalPaise).toBe(0);
    expect(Number.isNaN(c.totalPaise)).toBe(false);
  });
  it('splits CGST/SGST within the state and IGST across states', () => {
    const c = compute({ lines: [{ what: 'A', qty: '1', rate: '1000' }], gst }, 'regular');
    expect(taxLines(c, '27', '27')).toEqual([
      { label: 'CGST 9%', paise: 9000 },
      { label: 'SGST 9%', paise: 9000 },
    ]);
    expect(taxLines(c, '27', '23')).toEqual([{ label: 'IGST 18%', paise: 18000 }]);
  });
});
