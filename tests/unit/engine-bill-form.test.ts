import { describe, expect, it } from 'vitest';

import {
  blankLine,
  checkBill,
  gstByRate,
  hasMixedRates,
  linesToDraft,
  subtotalOf,
  summariseLines,
  type BillFormDraft,
} from '../../packages/engine/src/bill-form';

/** Salvaged from the MVP's tests/unit/bill-form.test.ts (tag mvp-final); messages are dictionary keys now. */
const line = (what: string, qty: string, rate: string) => ({ id: what, what, qty, rate });
const opts = { needsCustomerName: false, chargesGst: false };
const draft = (lines: BillFormDraft['lines'], patch: Partial<BillFormDraft> = {}): BillFormDraft => ({
  customerName: '',
  customerPhone: '',
  customerGstin: '',
  gstRateBp: null,
  gstOn: true,
  perLine: false,
  lines,
  ...patch,
});

describe('checkBill', () => {
  it('turns the three fields into priced lines', () => {
    const r = checkBill(draft([line('AMC visit', '1', '3,500'), line('Fan', '2', '1350')]), opts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lines.map((l) => [l.description, l.quantityMilli, l.unitPricePaise, l.gstBp, l.taxRateChosen])).toEqual([
      ['AMC visit', 1000, 350000, 0, true],
      ['Fan', 2000, 135000, 0, true],
    ]);
  });
  it('ignores a line nobody touched, but not a half-filled one', () => {
    expect(checkBill(draft([line('Visit', '1', '500'), blankLine('x')]), opts).ok).toBe(true);
    expect(checkBill(draft([line('Visit', '1', '')]), opts)).toMatchObject({
      ok: false,
      problem: { field: 'rate', lineId: 'Visit' },
      message: { key: 'error.amount' },
    });
  });
  it('needs at least one thing done', () => {
    expect(checkBill(draft([blankLine('a')]), opts)).toMatchObject({
      ok: false,
      problem: { field: 'lines' },
      message: { key: 'bill.check.empty' },
    });
  });
  it('asks the new customer for a name', () => {
    expect(
      checkBill(draft([line('Visit', '1', '500')], { customerName: '  ' }), { ...opts, needsCustomerName: true }),
    ).toMatchObject({ ok: false, problem: { field: 'customerName' } });
  });
  it('refuses a quantity of zero or a rate that is not a number', () => {
    expect(checkBill(draft([line('Visit', '0', '500')]), opts)).toMatchObject({ problem: { field: 'qty' } });
    expect(checkBill(draft([line('Visit', '1', 'five')]), opts)).toMatchObject({ problem: { field: 'rate' } });
  });
  it('puts one GST rate on every line for a registered owner, and knows when none was chosen', () => {
    const chosen = checkBill(draft([line('Visit', '1', '500')], { gstRateBp: 1800 }), { ...opts, chargesGst: true });
    expect(chosen.ok && chosen.lines[0]).toMatchObject({ gstBp: 1800, taxRateChosen: true });
    const none = checkBill(draft([line('Visit', '1', '500')]), { ...opts, chargesGst: true });
    expect(none.ok && none.lines[0]).toMatchObject({ gstBp: 0, taxRateChosen: false });
  });
});

describe('the running total', () => {
  it('adds what makes sense and skips what is half typed', () => {
    expect(subtotalOf([line('a', '2', '800'), line('b', '1', '450'), line('c', '1', '4x'), blankLine('d')])).toBe(
      205000,
    );
  });
});

describe('pichle jaisa hi', () => {
  const lines = [
    { description: 'AMC visit', quantityMilli: 1000, unitPricePaise: 350000, gstBp: 0, taxRateChosen: true },
    { description: 'Ceiling fan install', quantityMilli: 2000, unitPricePaise: 135000, gstBp: 0, taxRateChosen: true },
  ];
  it('describes last time in a few words', () => {
    expect(summariseLines(lines)).toBe('AMC visit + 2 Ceiling fan install');
    expect(summariseLines([...lines, ...lines])).toBe('AMC visit + 2 Ceiling fan install + AMC visit + 1');
  });
  it('puts last time back into the three fields', () => {
    let n = 0;
    expect(linesToDraft(lines, () => `new-${n++}`)).toEqual([
      { id: 'new-0', what: 'AMC visit', qty: '1', rate: '3500', gstBp: 0 },
      { id: 'new-1', what: 'Ceiling fan install', qty: '2', rate: '1350', gstBp: 0 },
    ]);
  });
});

describe('GST on this bill: Haan or Nahi, one rate or a rate per line', () => {
  const gstOpts = { needsCustomerName: false, chargesGst: true };
  const base = (patch: Partial<BillFormDraft>): BillFormDraft =>
    draft([line('Fan', '2', '1000'), { ...line('Wiring', '1', '500'), gstBp: 1200 }], { gstRateBp: 1800, ...patch });
  it('one rate for the whole bill ignores a line rate left over from before', () => {
    const r = checkBill(base({}), gstOpts);
    expect(r.ok && r.lines.map((l) => l.gstBp)).toEqual([1800, 1800]);
  });
  it('a rate per line uses each line, and the bill rate where a line has none', () => {
    const r = checkBill(base({ perLine: true }), gstOpts);
    expect(r.ok && r.lines.map((l) => l.gstBp)).toEqual([1800, 1200]);
    expect(gstByRate(base({ perLine: true }), true)).toEqual([
      { rateBp: 1200, taxablePaise: 50000, gstPaise: 6000 },
      { rateBp: 1800, taxablePaise: 200000, gstPaise: 36000 },
    ]);
  });
  it('Nahi: no GST on any line, and nothing left unanswered', () => {
    const r = checkBill(base({ gstOn: false, gstRateBp: null }), gstOpts);
    expect(r.ok && r.lines.every((l) => l.gstBp === 0 && l.taxRateChosen)).toBe(true);
    expect(gstByRate(base({ gstOn: false }), true)).toEqual([]);
  });
  it('a line with no rate chosen is marked so the bill cannot go out as a tax invoice', () => {
    const r = checkBill(base({ gstRateBp: null }), gstOpts);
    expect(r.ok && r.lines.map((l) => l.taxRateChosen)).toEqual([false, false]);
  });
  it('opens with a rate per line when last time had more than one', () => {
    expect(
      hasMixedRates([
        { ...line('a', '1', '1'), gstBp: 1800 },
        { ...line('b', '1', '1'), gstBp: 500 },
      ]),
    ).toBe(true);
    expect(
      hasMixedRates([
        { ...line('a', '1', '1'), gstBp: 1800 },
        { ...line('b', '1', '1'), gstBp: 1800 },
      ]),
    ).toBe(false);
  });
});
