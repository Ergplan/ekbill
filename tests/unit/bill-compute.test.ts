import { describe, expect, it } from 'vitest';

import { computeTax } from '../../packages/engine/src/index';

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
    expect(c.heads).toEqual([
      { label: 'IGST 5%', paise: 500 },
      { label: 'IGST 18%', paise: 1800 },
    ]);
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
  it('says when the pack has no rule for the date instead of crashing (a 2016 photo date)', () => {
    const c = compute(
      { lines: [{ what: 'A', qty: '1', rate: '100' }], gst, customerState: '27', date: '2016-01-01' },
      sharma,
    );
    expect(c.noRules).toBe(true);
    expect(c.totalPaise).toBe(0);
    expect(c.heads).toEqual([]);
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
  it('the form, the paper and the GST workings agree on a fixture bill', async () => {
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
    const gst = (await loadGst({
      person: owner,
      business: sharmaBiz,
      role: 'owner',
      as: null,
      session: null,
      theme: 'narangi',
      language: 'hi-Latn',
      loaded: null,
    }))!;
    const row = gst.b2b.find((r) => r.number === bill.number)!;
    expect(row.totalPaise).toBe(form.totalPaise);
    expect(row.gstPaise).toBe(form.gstPaise);
    expect(gst.byRate.find((r) => r.rate === 18)!.igstPaise).toBeGreaterThanOrEqual(form.igstPaise);
    expect(gst.taxablePaise).toBe(gst.byRate.reduce((a, r) => a + r.taxablePaise, 0));
    expect(gst.gstPaise).toBe(gst.byRate.reduce((a, r) => a + r.cgstPaise + r.sgstPaise + r.igstPaise, 0));
  });
  it('every fixture bill was computed by the engine (no second tax calculation in the generator)', () => {
    for (const b of FIXTURE.businesses) {
      for (const bill of FIXTURE.bills.filter((x) => x.business === b.id)) {
        const customer = customerOf(b, bill.customer);
        const tax = computeTax({
          lines: bill.lines.map((l) => ({
            description: l.what,
            quantityMilli: Math.round(l.qty * 1000),
            unitPricePaise: l.ratePaise,
            gstBp: (l.gstRate ?? 0) * 100,
          })),
          registration: b.registration,
          gstOn: bill.kind === 'tax-invoice',
          dateIso: bill.date,
          sellerStateCode: b.stateCode,
          customerStateCode: customer?.stateCode ?? null,
        });
        expect([bill.number, bill.subtotalPaise, bill.gstPaise, bill.totalPaise, bill.kind]).toEqual([
          bill.number,
          tax.subtotalPaise,
          tax.gstPaise,
          tax.totalPaise,
          tax.documentKind,
        ]);
      }
    }
  });
});
