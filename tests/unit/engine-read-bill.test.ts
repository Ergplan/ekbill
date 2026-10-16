import { describe, expect, it } from 'vitest';

import {
  checkReading,
  looseAmount,
  looseDate,
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
