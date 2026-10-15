import { describe, expect, it } from 'vitest';

import { computeTax, parseMoney, parseQuantity, selectableRates, supplyKind } from '../../packages/engine/src/index';

const line = (description: string, qty: string, price: string, pct: number) => ({
  description,
  quantityMilli: parseQuantity(qty),
  unitPricePaise: parseMoney(price),
  gstBp: pct * 100,
});

describe('computeTax (I4: the one tax calculation)', () => {
  it('computes each head from the taxable value, never from a rounded sibling', () => {
    // ₹0.03 at 18 %: 3 paise × 9 % = 0.27 paise → 0 for each head (the old split gave 1 / 0).
    const r = computeTax({
      lines: [line('A', '1', '0.03', 18)],
      registration: 'regular',
      gstOn: true,
      supply: 'intra',
    });
    expect(r.cgstPaise).toBe(0);
    expect(r.sgstPaise).toBe(0);
    expect(r.totalPaise).toBe(3);
    const big = computeTax({
      lines: [line('AMC', '1', '3500', 18), line('Fan', '2', '1350', 18)],
      registration: 'regular',
      gstOn: true,
      supply: 'intra',
    });
    expect(big.subtotalPaise).toBe(620000);
    expect(big.cgstPaise).toBe(55800);
    expect(big.sgstPaise).toBe(55800);
    expect(big.totalPaise).toBe(731600);
    expect(big.heads).toEqual([
      { label: 'CGST 9%', paise: 55800 },
      { label: 'SGST 9%', paise: 55800 },
    ]);
  });
  it('charges IGST across states and nothing for composition, unregistered or GST switched off', () => {
    const inter = computeTax({
      lines: [line('A', '1', '1000', 18)],
      registration: 'regular',
      gstOn: true,
      supply: 'inter',
    });
    expect(inter.igstPaise).toBe(18000);
    expect(inter.cgstPaise + inter.sgstPaise).toBe(0);
    expect(inter.heads).toEqual([{ label: 'IGST 18%', paise: 18000 }]);
    for (const registration of ['composition', 'unregistered', 'unknown'] as const) {
      const r = computeTax({ lines: [line('A', '1', '1000', 18)], registration, gstOn: true, supply: 'intra' });
      expect(r.gstPaise).toBe(0);
      expect(r.totalPaise).toBe(100000);
    }
    expect(
      computeTax({ lines: [line('A', '1', '1000', 18)], registration: 'regular', gstOn: false, supply: 'intra' })
        .gstPaise,
    ).toBe(0);
    expect(computeTax({ lines: [], registration: 'composition', gstOn: false, supply: 'intra' }).documentKind).toBe(
      'bill-of-supply',
    );
  });
  it('a line without a description carries no value, so the paper and the total agree', () => {
    const r = computeTax({
      lines: [line('A', '1', '100', 18), line('', '1', '200', 18)],
      registration: 'regular',
      gstOn: true,
      supply: 'intra',
    });
    expect(r.subtotalPaise).toBe(10000);
    expect(r.lines[1]?.blank).toBe(true);
  });
  it('rates per line are honoured', () => {
    const r = computeTax({
      lines: [line('A', '1', '100', 5), line('B', '1', '100', 18)],
      registration: 'regular',
      gstOn: true,
      supply: 'intra',
    });
    expect(r.lines.map((l) => l.cgstPaise + l.sgstPaise)).toEqual([500, 1800]);
    expect(r.heads.map((h) => h.label)).toEqual(['CGST', 'SGST']);
  });
  it('refuses an unsafe product instead of returning a wrong total', () => {
    expect(() =>
      computeTax({
        lines: [line('A', '100000000', '100000000', 18)],
        registration: 'regular',
        gstOn: true,
        supply: 'intra',
      }),
    ).toThrow();
  });
});

describe('the rule pack (I5)', () => {
  it('selects rates by document date', () => {
    expect(selectableRates('2025-09-21')).toEqual([0, 5, 12, 18, 28]);
    expect(selectableRates('2025-09-22')).toEqual([0, 5, 18, 40]);
    expect(selectableRates('2026-10-15')).toEqual([0, 5, 18, 40]);
    expect(selectableRates('2016-01-01')).toEqual([]);
  });
  it('decides place of supply by state code', () => {
    expect(supplyKind('27', '27')).toBe('intra');
    expect(supplyKind('27', '23')).toBe('inter');
    expect(supplyKind('27', null)).toBe('intra');
  });
});
