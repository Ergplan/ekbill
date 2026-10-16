import { describe, expect, it } from 'vitest';

import {
  checkReading,
  looseAmount,
  looseDate,
  keepsMatch,
  correctionsFrom,
  looseQuantity,
  nameLikeness,
  type BillReading,
} from '../../packages/engine/src/index';

/** Stage 7: what the engine does with a model's reading (staging only; totals are the engine's, I4). */
const f = (value: string | null, confidence = 0.9) => ({ value, confidence });
const reading = (patch: Partial<BillReading> = {}): BillReading => ({
  legible: true,
  found: true,
  customer: f('Joshi Builders'),
  date: f('23/8/26'),
  lines: [
    { what: f('Doorbell'), qty: f('4'), rate: f('340'), amount: f('1360/-') },
    { what: f('Doorbell'), qty: f('1'), rate: f('310'), amount: f('310/-') },
  ],
  total: f('₹ 1670/-'),
  ...patch,
});
const ctx = {
  today: '2026-10-15',
  customers: [
    { id: 'c1', name: 'Joshi Builders', phone: '+919876500001' },
    { id: 'c2', name: 'Mehta Traders', phone: '+919822100001' },
  ],
  registration: 'regular' as const,
  sellerStateCode: '27',
};

describe('loose readers', () => {
  it('reads amounts as Indian bills write them', () => {
    expect(looseAmount('₹ 1,670/-')).toBe('1670');
    expect(looseAmount('Rs. 1500.00')).toBe('1500');
    expect(looseAmount('12.50')).toBe('12.5');
    expect(looseAmount('twelve')).toBeNull();
    expect(looseAmount(null)).toBeNull();
  });
  it('reads a quantity with its unit', () => {
    expect(looseQuantity('2 pcs')).toEqual({ qty: '2', unit: 'pcs' });
    expect(looseQuantity('1.5 kg')).toEqual({ qty: '1.5', unit: 'kg' });
    expect(looseQuantity('3')).toEqual({ qty: '3', unit: null });
    expect(looseQuantity('a few')).toBeNull();
  });
  it('reads dates day first, in the shapes a pad has', () => {
    expect(looseDate('23/8/26', '2026-10-15')).toBe('2026-08-23');
    expect(looseDate('23-08-2026', '2026-10-15')).toBe('2026-08-23');
    expect(looseDate('5.9.2026', '2026-10-15')).toBe('2026-09-05');
    expect(looseDate('12 Oct', '2026-10-15')).toBe('2026-10-12');
    // Stage 11 review: with no year, the latest such day not after today (read on 5 January, "28 Dec" is last year's).
    expect(looseDate('28 Dec', '2027-01-05')).toBe('2026-12-28');
    expect(looseDate('5 Jan', '2027-01-05')).toBe('2027-01-05');
    expect(looseDate('6 Jan', '2027-01-05')).toBe('2026-01-06');
    expect(looseDate('2nd Sept 2026', '2026-10-15')).toBe('2026-09-02');
    expect(looseDate('31/2/26', '2026-10-15')).toBeNull();
    expect(looseDate('soon', '2026-10-15')).toBeNull();
  });
  it('scores names: the same firm with or without its suffix, not a different one', () => {
    expect(nameLikeness('Joshi Builders', 'joshi builders')).toBe(1);
    expect(nameLikeness('Mehta', 'Mehta Traders')).toBeGreaterThanOrEqual(0.85);
    expect(nameLikeness('Mehta Traders', 'Joshi Builders')).toBeLessThan(0.4);
  });
});

describe('checkReading', () => {
  it('a clean reading is ready, matched, with the engine adding the lines', () => {
    const r = checkReading(reading(), ctx);
    expect(r.outcome).toBe('ready');
    expect(r.date.value).toBe('2026-08-23');
    expect(r.lines.map((l) => [l.what.value, l.qty.value, l.rate.value, l.amount.value])).toEqual([
      ['Doorbell', '4', '340', '1360'],
      ['Doorbell', '1', '310', '310'],
    ]);
    expect(r.linesTotalPaise).toBe(167000);
    expect(r.totalsDiffer).toBe(false);
    expect(r.match).toEqual({ customerId: 'c1', name: 'Joshi Builders', score: 1 });
    expect(r.warnings).toEqual([]);
  });

  it('never trusts the total written on the photo: the lines decide, the difference is said', () => {
    const r = checkReading(reading({ total: f('1760') }), ctx);
    expect(r.linesTotalPaise).toBe(167000);
    expect(r.imageTotalPaise).toBe(176000);
    expect(r.totalsDiffer).toBe(true);
    expect(r.warnings).toContainEqual({
      code: 'total-differs',
      path: 'total',
      params: { read: 176000, lines: 167000 },
    });
  });

  it('flags quantity × rate that is not the amount, and derives a missing rate from the amount', () => {
    const r = checkReading(
      reading({
        lines: [
          { what: f('Wire'), qty: f('3'), rate: f('100'), amount: f('400') },
          { what: f('Labour'), qty: f('2'), rate: f(null), amount: f('900') },
        ],
        total: f('1200'),
      }),
      ctx,
    );
    expect(r.warnings).toContainEqual({
      code: 'line-amount',
      path: 'lines.0.amount',
      params: { expected: 30000, read: 40000 },
    });
    expect(r.lines[1]!.rate).toEqual({ value: '450', confidence: 0.7 });
    expect(r.warnings).toContainEqual({ code: 'rate-derived', path: 'lines.1.rate' });
    expect(r.linesTotalPaise).toBe(30000 + 90000);
  });

  it('derives and checks in whole paise, half up, and a misread huge quantity still checks (Stage 7 review, I4)', () => {
    const r = checkReading(
      reading({
        lines: [
          { what: f('Tape'), qty: f('3'), rate: f(null), amount: f('100') },
          { what: f('Pipe'), qty: f('0.4'), rate: f(null), amount: f('0.01') },
          { what: f('Bolt'), qty: f('999999'), rate: f('9999999999.99'), amount: f('1') },
        ],
        total: f('101.01'),
      }),
      ctx,
    );
    expect(r.lines[0]!.rate.value).toBe('33.33');
    // 1 paisa for 0.4 of a unit: 2.5 paise a unit, half up to 3.
    expect(r.lines[1]!.rate.value).toBe('0.03');
    // ₹999,99,99,999.99 × 9,99,999: past what a bill's arithmetic holds, so a misread to fix, not a failed reading.
    expect(r.lines[2]!.rate).toEqual({ value: null, confidence: 0, unreadable: true });
    expect(r.warnings).toContainEqual({ code: 'number', path: 'lines.2.rate' });
  });

  it('lights a number it cannot parse and a date that cannot be right', () => {
    const r = checkReading(
      reading({ date: f('12/12/26'), lines: [{ what: f('Fan'), qty: f('two'), rate: f('3S0'), amount: f('700') }] }),
      ctx,
    );
    expect(r.date).toEqual({ value: null, confidence: 0, unreadable: true });
    expect(r.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['date-implausible', 'number']));
    expect(r.lines[0]!.qty.unreadable).toBe(true);
    expect(r.lines[0]!.rate.unreadable).toBe(true);
    expect(checkReading(reading({ date: f('1/1/24') }), ctx).date.value).toBeNull();
  });

  it('keeps unreadable fields empty, clamps confidences, and matches by phone first', () => {
    const r = checkReading(
      reading({
        customer: { value: 'J. Bldrs', confidence: 3 },
        phone: f('98765 00001'),
        lines: [
          {
            what: { value: 'Fan', confidence: -1 },
            qty: f('1'),
            rate: { value: null, confidence: 0, unreadable: true },
            amount: f('350'),
          },
        ],
        total: f('350'),
      }),
      ctx,
    );
    expect(r.customer.confidence).toBe(1);
    expect(r.lines[0]!.what.confidence).toBe(0);
    expect(r.match).toMatchObject({ customerId: 'c1', score: 1 });
  });

  it('says unreadable for a blurred photo and no-bill for a photo of something else', () => {
    expect(checkReading(reading({ legible: false }), ctx).outcome).toBe('unreadable');
    expect(checkReading(reading({ found: false }), ctx).outcome).toBe('no-bill');
    expect(checkReading(reading({ lines: [] }), ctx).outcome).toBe('no-bill');
  });

  it('a name it cannot match is a new customer, said', () => {
    const r = checkReading(reading({ customer: f('Kale Hardware') }), ctx);
    expect(r.match).toBeNull();
    expect(r.warnings).toContainEqual({ code: 'customer-new', path: 'customer' });
  });
});

// Stage 11 review: "Gupta Traders se mila (100%)" by phone, the paper said "Ramesh": the bill went to a new
// customer called Ramesh. The match stands until the owner types another name.
describe('the matched customer on the photo review', () => {
  it('stands while the name is as read, or close to the match; goes when the owner types someone else', () => {
    expect(keepsMatch('Ramesh', 'Ramesh', 'Gupta Traders')).toBe(true);
    expect(keepsMatch('Gupta Traders', 'Ramesh', 'Gupta Traders')).toBe(true);
    expect(keepsMatch('Mehta Traders', 'Ramesh', 'Gupta Traders')).toBe(false);
    expect(keepsMatch('  ', 'Ramesh', 'Gupta Traders')).toBe(false);
  });
});

// Stage 11 review: a bank account or a barcode read as an amount overflowed the money in checkReading, the job
// threw, and the reading stayed pending for good. Such a figure is not an amount.
describe('a figure too big to be an amount', () => {
  it('is no amount and no quantity, and the reading is checked without throwing', () => {
    expect(looseAmount('99999999999999999')).toBeNull();
    expect(looseAmount('9999999999')).toBe('9999999999');
    expect(looseQuantity('9999999')).toBeNull();
    for (const patch of [
      { lines: [{ what: f('Panel'), qty: f('1'), rate: f('99999999999999999'), amount: f(null) }] },
      { lines: [{ what: f('Panel'), qty: f('999999'), rate: f('99999999999'), amount: f(null) }] },
      { total: f('999999999999999999') },
    ])
      expect(() => checkReading(reading(patch), ctx)).not.toThrow();
  });
});

// Stage 11 review: the corrections were whatever the screen sent. The server works them out from the reading and
// the bill made from it.
describe('what the owner changed on the review', () => {
  it('is every field where the bill differs from the reading, and nothing else', () => {
    const r = checkReading(reading(), ctx);
    const billed = {
      customerName: 'Joshi Builders',
      issueDate: r.date.value!,
      lines: [
        { what: 'Doorbell', qty: '4', rate: '350' },
        { what: 'Doorbell', qty: '1', rate: '310' },
        { what: 'Wire', qty: '2', rate: '50' },
      ],
    };
    expect(correctionsFrom(r, billed)).toEqual([
      { field: 'lines.0.rate', modelValue: '340', humanValue: '350' },
      { field: 'lines.2.what', modelValue: null, humanValue: 'Wire' },
      { field: 'lines.2.qty', modelValue: null, humanValue: '2' },
      { field: 'lines.2.rate', modelValue: null, humanValue: '50' },
    ]);
  });
});
