import { describe, expect, it } from 'vitest';

import {
  computeTax,
  documentKind,
  parseMoney,
  parseQuantity,
  placeOfSupply,
  selectableRates,
  supplyKind,
  type TaxInput,
} from '../../packages/engine/src/index';

const line = (description: string, qty: string, price: string, pct: number) => ({
  description,
  quantityMilli: parseQuantity(qty),
  unitPricePaise: parseMoney(price),
  gstBp: pct * 100,
});
const DATE = '2026-10-15';
const intra: Omit<TaxInput, 'lines'> = {
  registration: 'regular',
  gstOn: true,
  dateIso: DATE,
  sellerStateCode: '27',
  customerStateCode: '27',
};
const inter: Omit<TaxInput, 'lines'> = { ...intra, customerStateCode: '23' };

describe('computeTax (I4: the one tax calculation)', () => {
  it('computes each head from the taxable value, never from a rounded sibling', () => {
    // ₹0.03 at 18 %: 3 paise × 9 % = 0.27 paise → 0 for each head (the old split gave 1 / 0).
    const r = computeTax({ ...intra, lines: [line('A', '1', '0.03', 18)] });
    expect(r.cgstPaise).toBe(0);
    expect(r.statePaise).toBe(0);
    expect(r.totalPaise).toBe(3);
    const big = computeTax({ ...intra, lines: [line('AMC', '1', '3500', 18), line('Fan', '2', '1350', 18)] });
    expect(big.subtotalPaise).toBe(620000);
    expect(big.cgstPaise).toBe(55800);
    expect(big.statePaise).toBe(55800);
    expect(big.totalPaise).toBe(731600);
    expect(big.stateHead).toBe('SGST');
    expect(big.heads).toEqual([
      { label: 'CGST 9%', paise: 55800 },
      { label: 'SGST 9%', paise: 55800 },
    ]);
    expect(big.rulesApplied).toEqual(['place-of-supply-state', 'document-kinds-2017']);
  });
  it('keeps half rates exact: an odd basis-point rate is not truncated at the head', () => {
    // 1.01 % on ₹1000: 100000 × 101 / 20000 = 505 paise for each head, not 500 (bp/2 truncated to 50).
    const r = computeTax({ ...intra, lines: [{ ...line('A', '1', '1000', 0), gstBp: 101 }] });
    expect(r.cgstPaise).toBe(505);
    expect(r.statePaise).toBe(505);
    expect(r.gstPaise).toBe(1010);
    expect(computeTax({ ...inter, lines: [{ ...line('A', '1', '1000', 0), gstBp: 101 }] }).igstPaise).toBe(1010);
  });
  it('charges IGST across states and nothing for composition, unregistered or GST switched off', () => {
    const r = computeTax({ ...inter, lines: [line('A', '1', '1000', 18)] });
    expect(r.supply).toBe('inter');
    expect(r.igstPaise).toBe(18000);
    expect(r.cgstPaise + r.statePaise).toBe(0);
    expect(r.heads).toEqual([{ label: 'IGST 18%', paise: 18000 }]);
    for (const registration of ['composition', 'unregistered', 'unknown'] as const) {
      const x = computeTax({ ...intra, registration, lines: [line('A', '1', '1000', 18)] });
      expect(x.gstPaise).toBe(0);
      expect(x.totalPaise).toBe(100000);
      expect(x.heads).toEqual([]);
    }
    expect(computeTax({ ...intra, gstOn: false, lines: [line('A', '1', '1000', 18)] }).gstPaise).toBe(0);
    expect(computeTax({ ...intra, registration: 'composition', gstOn: false, lines: [] }).documentKind).toBe(
      'bill-of-supply',
    );
  });
  it('names the state head UTGST in a union territory', () => {
    const r = computeTax({
      ...intra,
      sellerStateCode: '04',
      customerStateCode: '04',
      lines: [line('A', '1', '100', 18)],
    });
    expect(r.stateHead).toBe('UTGST');
    expect(r.heads.map((h) => h.label)).toEqual(['CGST 9%', 'UTGST 9%']);
  });
  it('a line without a description carries no value, so the paper and the total agree', () => {
    const r = computeTax({ ...intra, lines: [line('A', '1', '100', 18), line('', '1', '200', 18)] });
    expect(r.subtotalPaise).toBe(10000);
    expect(r.lines[1]?.blank).toBe(true);
  });
  it('rates per line are honoured', () => {
    const r = computeTax({ ...intra, lines: [line('A', '1', '100', 5), line('B', '1', '100', 18)] });
    expect(r.lines.map((l) => l.cgstPaise + l.statePaise)).toEqual([500, 1800]);
    expect(r.heads.map((h) => h.label)).toEqual(['CGST', 'SGST']);
  });
  it('refuses an unsafe product instead of returning a wrong total', () => {
    expect(() => computeTax({ ...intra, lines: [line('A', '100000000', '100000000', 18)] })).toThrow();
  });
  it('refuses a date before any rule pack applies', () => {
    expect(() => computeTax({ ...intra, dateIso: '2016-01-01', lines: [line('A', '1', '100', 18)] })).toThrow();
  });
});

describe('the rule pack (I5)', () => {
  it('selects rates by document date', () => {
    expect(selectableRates('2025-09-21')).toEqual([0, 5, 12, 18, 28]);
    expect(selectableRates('2025-09-22')).toEqual([0, 5, 18, 40]);
    expect(selectableRates('2026-10-15')).toEqual([0, 5, 18, 40]);
    expect(selectableRates('2016-01-01')).toEqual([]);
  });
  it('decides place of supply by state code, on the date', () => {
    expect(supplyKind('27', '27', DATE)).toBe('intra');
    expect(supplyKind('27', '23', DATE)).toBe('inter');
    expect(supplyKind('27', null, DATE)).toBe('intra');
    expect(placeOfSupply('27', '27', DATE)).toMatchObject({ supply: 'intra', stateHead: 'SGST' });
    expect(placeOfSupply('04', '04', DATE)).toMatchObject({ supply: 'intra', stateHead: 'UTGST' });
  });
  it('decides the document kind from the pack, not from code', () => {
    expect(documentKind('regular', true, DATE)).toBe('tax-invoice');
    expect(documentKind('regular', false, DATE)).toBe('invoice');
    expect(documentKind('composition', true, DATE)).toBe('bill-of-supply');
    expect(documentKind('unregistered', true, DATE)).toBe('invoice');
    expect(documentKind('unknown', true, DATE)).toBe('invoice');
  });
});
