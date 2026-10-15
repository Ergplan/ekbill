import { describe, expect, it } from 'vitest';

import { businessFromSetup, compute, ratesFor } from '../../apps/web/screens/bill/compute';
import { billOf, customerOf } from '../../apps/web/screens/common';
import { FIXTURE } from '../../apps/web/screens/fixtures';
import { loadGst } from '../../apps/web/screens/gst/data';
import { paperOfBill } from '../../apps/web/screens/paper';

const gst = { on: true, mode: 'one' as const, rate: 18, perLine: [] };
const date = '2026-10-15';
const sharma = { registration: 'regular' as const, stateCode: '27' };

describe('the bill form reads the engine (I4)', () => {
  it('one rate on everything for a regular business within the state', () => {
    const c = compute(
      {
        lines: [
          { what: 'AMC', qty: '1', rate: '3500' },
          { what: 'Fan', qty: '2', rate: '1350' },
        ],
        gst,
        customerState: '27',
        date,
      },
      sharma,
    );
    expect(c.subtotalPaise).toBe(620000);
    expect(c.gstPaise).toBe(111600);
    expect(c.totalPaise).toBe(731600);
    expect(c.heads.map((h) => h.label)).toEqual(['CGST 9%', 'SGST 9%']);
  });
  it('IGST across states; per-line rates honoured', () => {
    const c = compute(
      {
        lines: [
          { what: 'A', qty: '1', rate: '100' },
          { what: 'B', qty: '1', rate: '100' },
        ],
        gst: { ...gst, mode: 'perline', perLine: [5, 18] },
        customerState: '23',
        date,
      },
      sharma,
    );
    expect(c.lines.map((l) => l.igstPaise)).toEqual([500, 1800]);
    expect(c.heads).toEqual([{ label: 'IGST', paise: 2300 }]);
  });
  it('never taxes a composition business or a bill with GST switched off', () => {
    expect(
      compute(
        { lines: [{ what: 'A', qty: '1', rate: '100' }], gst, customerState: '27', date },
        { registration: 'composition', stateCode: '27' },
      ).gstPaise,
    ).toBe(0);
    expect(
      compute(
        { lines: [{ what: 'A', qty: '1', rate: '100' }], gst: { ...gst, on: false }, customerState: '27', date },
        sharma,
      ).gstPaise,
    ).toBe(0);
  });
  it('treats an unparsable field as zero and a blank line as worthless, never NaN', () => {
    const c = compute(
      {
        lines: [
          { what: 'A', qty: 'two', rate: '1,350' },
          { what: '', qty: '1', rate: '200' },
        ],
        gst,
        customerState: '27',
        date,
      },
      sharma,
    );
    expect(c.totalPaise).toBe(0);
    expect(Number.isNaN(c.totalPaise)).toBe(false);
  });
  it('marks an overflow instead of crashing the form', () => {
    const c = compute(
      { lines: [{ what: 'A', qty: '100000000', rate: '100000000' }], gst, customerState: '27', date },
      sharma,
    );
    expect(c.overflow).toBe(true);
    expect(c.totalPaise).toBe(0);
  });
  it('offers the rule pack’s rates for the bill’s date (I5)', () => {
    expect(ratesFor('2026-10-15')).toEqual([0, 5, 18, 40]);
    expect(ratesFor('2025-01-01')).toEqual([0, 5, 12, 18, 28]);
  });
  it('builds a brand-new owner’s business from the setup answers', () => {
    const fallback = {
      name: '',
      registration: 'unregistered' as const,
      stateCode: null,
      stateName: null,
      defaultRate: 18,
      upi: null,
      gstin: null,
      address: null,
    };
    const b = businessFromSetup(
      { name: 'Naya Electricals', gst: 'yes', gstin: '27AAPFU0939F1ZV', upi: 'naya@upi' },
      fallback,
    );
    expect(b.registration).toBe('regular');
    expect(b.gstin).toBe('27AAPFU0939F1ZV');
    expect(b.stateCode).toBe('27');
    expect(b.upi).toBe('naya@upi');
    expect(businessFromSetup({ name: 'X', gst: 'no' }, fallback).registration).toBe('unregistered');
    expect(businessFromSetup(null, fallback)).toBe(fallback);
  });
});

describe('every consumer reads the same engine result (I4)', () => {
  const sharmaBiz = FIXTURE.businesses.find((b) => b.id === 'sharma')!;
  it('the form, the paper and the GST workings agree on a fixture bill', () => {
    const bill = billOf(sharmaBiz, 'INV-037')!; // Bansal, Madhya Pradesh: IGST
    const customer = customerOf(sharmaBiz, bill.customer);
    const form = compute(
      {
        lines: bill.lines.map((l) => ({ what: l.what, qty: String(l.qty), rate: String(l.ratePaise / 100) })),
        gst: { on: bill.kind === 'tax-invoice', mode: 'one', rate: bill.lines[0]?.gstRate ?? 0, perLine: [] },
        customerState: customer?.stateCode ?? null,
        date: bill.date,
      },
      { registration: sharmaBiz.registration, stateCode: sharmaBiz.stateCode },
    );
    const paper = paperOfBill(sharmaBiz, bill, customer);
    expect(paper.totalPaise).toBe(form.totalPaise);
    expect(paper.taxLines).toEqual(form.heads);
    expect(form.heads.map((h) => h.label)).toEqual(['IGST 18%']);
    const owner = FIXTURE.people.find((p) => p.business === 'sharma' && p.role === 'owner')!;
    const gst = loadGst({ person: owner, business: sharmaBiz, role: 'owner', as: null })!;
    const row = gst.b2b.find((r) => r.number === bill.number)!;
    expect(row.totalPaise).toBe(form.totalPaise);
    expect(row.gstPaise).toBe(form.gstPaise);
    expect(gst.byRate.find((r) => r.rate === 18)!.igstPaise).toBeGreaterThanOrEqual(form.igstPaise);
    expect(gst.taxablePaise).toBe(gst.byRate.reduce((a, r) => a + r.taxablePaise, 0));
    expect(gst.gstPaise).toBe(gst.byRate.reduce((a, r) => a + r.cgstPaise + r.sgstPaise + r.igstPaise, 0));
  });
});
