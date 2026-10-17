import { describe, expect, it } from 'vitest';

import { chooseSet, denominatorsOf, setCounts, type EvalBill } from '../../packages/ai/eval/score';

/** Stage 7 review: the eval's set counts came from folder sizes, and a failed read left the denominators. */
const bill = (name: string, source: EvalBill['source'], lines = 2, total: number | null = 100): EvalBill => ({
  jpg: `${name}.jpg`,
  source,
  truth: {
    name,
    customer: 'X',
    date: '2026-10-01',
    lines: Array.from({ length: lines }, () => ({ what: 'a', qty: 1, rate: 1, amount: 1 })),
    total,
  },
});

describe('the read-bill eval’s bookkeeping', () => {
  it('counts real and synthetic from the bills run, not the folders', () => {
    const real = [bill('r1', 'real'), bill('r2', 'real')];
    const synthetic = Array.from({ length: 40 }, (_, i) => bill(`s${i}`, 'synthetic'));
    expect(setCounts(chooseSet(real, synthetic, null))).toEqual({ real: 2, synthetic: 28 });
    expect(setCounts(chooseSet(real, synthetic, 'synthetic'))).toEqual({ real: 0, synthetic: 40 });
    expect(setCounts(chooseSet(real, synthetic, 'real'))).toEqual({ real: 2, synthetic: 0 });
  });

  it('a bill not read still counts for its fields, lines and total', () => {
    expect(denominatorsOf(bill('b', 'real', 3, 500).truth)).toEqual({ fields: 14, asked: 14, lines: 3, withTotal: 1 });
    expect(denominatorsOf(bill('b', 'real', 1, null).truth)).toEqual({ fields: 6, asked: 6, lines: 1, withTotal: 0 });
    expect(denominatorsOf({ ...bill('u', 'synthetic').truth, legible: false })).toEqual({
      fields: 1,
      asked: 0,
      lines: 0,
      withTotal: 0,
    });
  });
});
