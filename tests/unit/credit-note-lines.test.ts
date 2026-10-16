import { describe, expect, it } from 'vitest';

import { computeTax } from '../../packages/engine/src/tax';
import { creditNoteLines } from '../../packages/engine/src/issue';

/**
 * A credit note against a bill (Stage 11, fourth review): one tax-inclusive line for each HSN code and rate the
 * bill carried, so GSTR-1's HSN table nets the note against the bill's own codes, and the parts add up to the
 * amount to the paisa.
 */
const bill = computeTax({
  lines: [
    {
      description: 'AMC visit',
      quantityMilli: 2000,
      unitPricePaise: 350000,
      gstBp: 1800,
      hsnCode: '998719',
      unit: 'visit',
    },
    { description: 'Fan', quantityMilli: 1000, unitPricePaise: 135000, gstBp: 1800, hsnCode: '8414', unit: 'nos' },
    {
      description: 'Fan again',
      quantityMilli: 1000,
      unitPricePaise: 135000,
      gstBp: 1800,
      hsnCode: '8414',
      unit: 'nos',
    },
    { description: 'Rice', quantityMilli: 1000, unitPricePaise: 10000, gstBp: 500, hsnCode: '1006', unit: 'kg' },
    { description: '', quantityMilli: 1000, unitPricePaise: 0, gstBp: 1800 },
  ],
  registration: 'regular',
  gstOn: true,
  dateIso: '2026-09-24',
  sellerStateCode: '27',
  customerStateCode: '27',
  roundToRupee: false,
});

describe('creditNoteLines', () => {
  it('gives one line per HSN code and rate, tax-inclusive, adding up to the amount', () => {
    const lines = creditNoteLines(bill.lines, 123457, 'Discount after delivery');
    expect(lines.map((l) => [l.hsnCode, l.gstBp, l.unit])).toEqual([
      ['998719', 1800, 'visit'],
      ['8414', 1800, 'nos'],
      ['1006', 500, 'kg'],
    ]);
    expect(lines.every((l) => l.priceIncludesTax && l.quantityMilli === 1000 && l.taxRateChosen)).toBe(true);
    expect(lines.reduce((s, l) => s + l.unitPricePaise, 0)).toBe(123457);
    expect(lines[0]!.description).toBe('Discount after delivery');
  });
  it('a note for the whole bill gives back each group’s value', () => {
    const lines = creditNoteLines(bill.lines, bill.totalPaise, 'Return');
    const group = (code: string) => bill.lines.filter((l) => l.hsnCode === code).reduce((s, l) => s + l.totalPaise, 0);
    expect(lines.map((l) => l.unitPricePaise)).toEqual([group('998719'), group('8414'), group('1006')]);
  });
  it('nothing to credit on a bill with no value', () => {
    expect(creditNoteLines([], 1000, 'x')).toEqual([]);
  });
});
