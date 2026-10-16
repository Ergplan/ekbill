import { describe, expect, it } from 'vitest';

import { parseMoney, parsePercent, parseQuantity } from '../../packages/engine/src/money';
import { TaxEngineError, computeTax, type TaxInput } from '../../packages/engine/src/tax';

/**
 * Salvaged from the MVP's tests/unit/tax-engine.test.ts "calculation fixtures"
 * (tag mvp-final), reshaped to the v2 input: the registration and the date
 * select the document kind and the rules; `chargesGst: false` is an
 * unregistered seller; the place of supply is the customer's state.
 */
const L = (description: string, qty: string, price: string, rate: string, extra = {}) => ({
  description,
  quantityMilli: parseQuantity(qty),
  unitPricePaise: parseMoney(price),
  gstBp: parsePercent(rate),
  ...extra,
});
const DATE = '2026-09-24';
const regular = (customerStateCode: string | null, lines: TaxInput['lines'], roundToRupee = false): TaxInput => ({
  lines,
  registration: 'regular',
  gstOn: true,
  dateIso: DATE,
  sellerStateCode: '27',
  customerStateCode,
  roundToRupee,
});

describe('calculation fixtures', () => {
  const repairLines = [L('Repair visit', '2', '800', '0'), L('Spare parts', '1', '450', '0')];
  it("subtotals the brief's example to 2,050 with no tax for an unregistered seller", () => {
    const r = computeTax({
      lines: repairLines,
      registration: 'unregistered',
      gstOn: true,
      dateIso: DATE,
      sellerStateCode: null,
      customerStateCode: null,
      roundToRupee: true,
    });
    expect(r.subtotalPaise).toBe(205000);
    expect(r.gstPaise).toBe(0);
    expect(r.totalPaise).toBe(205000);
    expect(r.documentKind).toBe('invoice');
  });
  it('splits an intra-state supply into equal CGST and SGST halves', () => {
    const r = computeTax(
      regular('27', [L('Repair visit', '2', '800', '18'), L('Spare parts', '1', '450', '18')], true),
    );
    expect(r.supply).toBe('intra');
    expect(r.subtotalPaise).toBe(205000);
    expect(r.cgstPaise).toBe(18450);
    expect(r.statePaise).toBe(18450);
    expect(r.igstPaise).toBe(0);
    expect(r.totalPaise).toBe(241900);
  });
  it('charges IGST on an interstate supply and reaches the same total', () => {
    const r = computeTax(
      regular('29', [L('Repair visit', '2', '800', '18'), L('Spare parts', '1', '450', '18')], true),
    );
    expect(r.supply).toBe('inter');
    expect(r.igstPaise).toBe(36900);
    expect(r.cgstPaise).toBe(0);
    expect(r.totalPaise).toBe(241900);
  });
  it('uses UTGST for a union territory without a legislature, SGST for Delhi', () => {
    const chandigarh = computeTax({ ...regular('04', [L('Service', '1', '1000', '18')]), sellerStateCode: '04' });
    expect(chandigarh.stateHead).toBe('UTGST');
    const delhi = computeTax({ ...regular('07', [L('Service', '1', '1000', '18')]), sellerStateCode: '07' });
    expect(delhi.stateHead).toBe('SGST');
  });
  it('backs tax out of a tax-inclusive price', () => {
    const r = computeTax(regular('27', [L('All-in price', '1', '1180', '18', { priceIncludesTax: true })]));
    expect(r.subtotalPaise).toBe(100000);
    expect(r.gstPaise).toBe(18000);
    expect(r.totalBeforeRoundingPaise).toBe(118000);
  });
  it('applies a line discount before tax', () => {
    const r = computeTax(regular('27', [L('Service', '1', '1000', '18', { discountPaise: parseMoney('100') })]));
    expect(r.subtotalPaise).toBe(90000);
    expect(r.discountPaise).toBe(10000);
    expect(r.gstPaise).toBe(16200);
  });
  it('carries the rupee round-off as a visible, reconciling figure', () => {
    const r = computeTax(regular('27', [L('Odd', '1', '999.49', '18')], true));
    expect(r.totalBeforeRoundingPaise + r.roundOffPaise).toBe(r.totalPaise);
    expect(r.totalPaise % 100).toBe(0);
    expect(r.heads.at(-1)).toEqual({ label: 'Round off', paise: r.roundOffPaise });
  });
  it('keeps cess as a head of its own', () => {
    const r = computeTax(regular('29', [L('Cess item', '1', '1000', '28', { cessBp: parsePercent('12') })]));
    expect(r.igstPaise).toBe(28000);
    expect(r.cessPaise).toBe(12000);
    expect(r.gstPaise).toBe(40000);
    expect(r.heads.map((h) => h.label)).toEqual(['IGST 28%', 'Cess']);
  });
  it('groups by rate, which is what return tables are built from', () => {
    const r = computeTax(
      regular('27', [L('Five', '1', '1000', '5'), L('Eighteen', '1', '1000', '18'), L('Five again', '2', '500', '5')]),
    );
    expect(r.rateSummary).toHaveLength(2);
    expect(r.rateSummary[0]).toMatchObject({ gstBp: 500, taxablePaise: 200000 });
    expect(r.rateSummary[1]).toMatchObject({ gstBp: 1800, taxablePaise: 100000 });
  });
  it('keeps the halves exact on an odd rate (each head from the taxable value at half the rate, rounded once)', () => {
    // 0.1% on 333.33: 33333 × 10 / 20000 = 16.67 → 17 paise per head; the MVP's halving of the rate first gave 16 and 17.
    const r = computeTax(regular('27', [L('Odd rate', '1', '333.33', '0.1')]));
    expect(r.cgstPaise + r.statePaise).toBe(r.gstPaise);
    expect(r.cgstPaise).toBe(r.statePaise);
    expect(r.headRoundingNote).toBeNull();
  });
  it('refuses invalid input instead of producing a wrong number', () => {
    expect(() => computeTax(regular('27', [L('Bad', '1', '100', '18', { discountPaise: parseMoney('500') })]))).toThrow(
      TaxEngineError,
    );
    expect(() => computeTax(regular('27', [L('Negative', '1', '100', '-5')]))).toThrow(TaxEngineError);
  });
  it('an unknown customer state counts as the pack says (intra), never as an error on the form', () => {
    expect(computeTax(regular(null, [L('A', '1', '100', '18')])).supply).toBe('intra');
  });
});

// Found by the Stage 11 review: a tax-inclusive figure was backed out to a taxable value and the heads rounded
// forward again, so the line came to a paisa more or less than what was entered: a credit note for a whole bill
// (₹1,355 at 5 %: invoice ₹1,422.76, note ₹1,422.77) gave back more than was charged, or left ₹0.01 due for ever.
describe('a tax-inclusive figure is the line total, to the paisa', () => {
  it('₹1,422.76 including 5 % is ₹1,422.76, and backs out to the invoice it came from', () => {
    const inv = computeTax(regular('27', [L('Work', '1', '1355', '5')]));
    const note = computeTax(regular('27', [L('Credit', '1', '1422.76', '5', { priceIncludesTax: true })]));
    expect(inv.totalPaise).toBe(142276);
    expect(note).toMatchObject({ totalPaise: 142276, subtotalPaise: 135500, gstPaise: inv.gstPaise });
  });

  it('a full credit note gives back exactly what every invoice charged (every rate, intra and inter-State)', () => {
    const misses: string[] = [];
    for (const rate of ['0.25', '3', '5', '12', '18', '28'])
      for (const state of ['27', '29'])
        for (let rupees = 1; rupees <= 1500; rupees += 1) {
          const price = `${rupees}.${String(rupees % 100).padStart(2, '0')}`;
          const inv = computeTax(regular(state, [L('Work', '1', price, rate)]));
          const back = (inv.totalPaise / 100).toFixed(2);
          const note = computeTax(regular(state, [L('Credit', '1', back, rate, { priceIncludesTax: true })]));
          if (
            note.totalPaise !== inv.totalPaise ||
            note.subtotalPaise !== inv.subtotalPaise ||
            note.gstPaise !== inv.gstPaise
          )
            misses.push(`${price} at ${rate}% (${state})`);
        }
    expect(misses.slice(0, 5)).toEqual([]);
  });
});
