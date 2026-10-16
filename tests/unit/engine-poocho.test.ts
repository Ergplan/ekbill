import { describe, expect, it } from 'vitest';

import {
  billRecord,
  citationsIn,
  customerRecord,
  fuseRanks,
  itemRecord,
  recordsMessage,
  renumberCitations,
  tsQueryFor,
  type BillForSearch,
} from '../../packages/engine/src/index';

/** Stage 9, Poocho: the record texts, the query, the fusion and the citations (salvaged from the MVP's documents.ts). */
const bill: BillForSearch = {
  id: '00000000-0000-4000-8000-000000000001',
  number: 'INV-042',
  kind: 'tax_invoice',
  status: 'issued',
  dateIso: '2026-09-24',
  dueDate: '2026-10-09',
  customerName: 'Mehta Traders',
  customerCity: 'Pune',
  lines: [
    { description: 'AMC visit', quantityMilli: 1000, unitPricePaise: 350000, gstBp: 1800 },
    { description: 'Fan repair', quantityMilli: 2500, unitPricePaise: 125000, gstBp: 1800 },
  ],
  subtotalPaise: 662500,
  gstPaise: 119250,
  totalPaise: 781750,
  cancelledReason: null,
  notes: null,
  linkedNumber: null,
  paidPaise: 300000,
  duePaise: 481750,
  payments: [{ date: '2026-09-30', amountPaise: 300000, method: 'upi' }],
  creditNotes: [],
};

describe('the record texts', () => {
  it('a bill says who, when, what, the rate, what came and what is still to come', () => {
    const r = billRecord(bill);
    expect(r).toMatchObject({
      kind: 'bill',
      sourceId: bill.id,
      title: 'Bill INV-042 · Mehta Traders',
      href: '/bills/INV-042?fy=2026-27',
    });
    expect(r.text).toContain('Bill INV-042 dated 24 Sep 2026 to Mehta Traders (Pune).');
    expect(r.text).toContain('AMC visit: 1 x ₹3,500 = ₹3,500, GST 18%');
    expect(r.text).toContain('Fan repair: 2.5 x ₹1,250 = ₹3,125');
    expect(r.text).toContain('Received ₹3,000 on 30 Sep 2026 by UPI.');
    expect(r.text).toContain('Still to come: ₹4,817.50, due 09 Oct 2026.');
  });

  it('a settled, a cancelled bill and a credit note say so', () => {
    expect(billRecord({ ...bill, duePaise: 0 }).text).toContain('Fully settled.');
    const cancelled = billRecord({ ...bill, status: 'cancelled', cancelledReason: 'galat rate' }).text;
    expect(cancelled).toContain('This bill was cancelled (galat rate).');
    expect(cancelled).not.toContain('Still to come');
    const note = billRecord({ ...bill, kind: 'credit_note', number: 'CN-001', linkedNumber: 'INV-042' });
    expect(note.title).toBe('Credit note CN-001 · Mehta Traders');
    expect(note.text).toContain('against bill INV-042');
    expect(note.text).not.toContain('Still to come');
    expect(billRecord({ ...bill, creditNotes: [{ number: 'CN-001', totalPaise: 50000 }] }).text).toContain(
      'Credit note CN-001 for ₹500 against it.',
    );
  });

  it('a customer and an item; no phone, GSTIN or bank detail is ever written', () => {
    const c = customerRecord({
      id: 'c1',
      name: 'Mehta Traders',
      contactPerson: 'Rakesh',
      city: 'Pune',
      stateName: 'Maharashtra',
      lastBilledAt: '2026-09-24',
      notes: null,
    });
    expect(c.text).toBe('Customer Mehta Traders, contact Rakesh, Pune (Maharashtra). Last billed on 24 Sep 2026.');
    expect(c.href).toBe('/customers/c1');
    const i = itemRecord({
      id: 'i1',
      name: 'AMC visit',
      description: null,
      hsnSac: '998719',
      unit: 'visit',
      defaultRatePaise: 350000,
      defaultTaxBp: 1800,
    });
    expect(i.text).toBe('Item AMC visit. Usual rate ₹3,500 per visit. GST 18%. HSN/SAC 998719.');
    for (const text of [billRecord(bill).text, c.text, i.text]) {
      expect(text).not.toMatch(/\+91|[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]/);
    }
  });
});

describe('the query', () => {
  it('keeps the meaningful words as prefixes and drops the Hinglish glue', () => {
    expect(tsQueryFor('Mehta ko pichli baar kya rate diya?')).toBe('mehta:* | rate:*');
    expect(tsQueryFor('kya hai')).toBeNull();
    expect(tsQueryFor('')).toBeNull();
  });
  it('cannot be broken by tsquery syntax in the question', () => {
    const q = tsQueryFor("mehta' | !(x) & y:* \\ ok")!;
    expect(q).not.toMatch(/['!()&\\]/);
    expect(q.split(' | ').every((w) => /^[\p{L}\p{N}]+:\*$/u.test(w))).toBe(true);
  });
});

describe('fusion and citations', () => {
  it('a record both searches rank high comes first', () => {
    expect(
      fuseRanks([
        ['a', 'b', 'c'],
        ['b', 'd'],
      ]),
    ).toEqual(['b', 'a', 'd', 'c']);
    expect(fuseRanks([])).toEqual([]);
  });
  it('numbers the records for the model, and the answer cites only ones that exist', () => {
    const m = recordsMessage('Mehta ka rate?', [
      { title: 'Bill INV-042 · Mehta Traders', text: 'one' },
      { title: 'Item · AMC', text: 'two' },
    ]);
    expect(m).toContain('[1] Bill INV-042 · Mehta Traders\none');
    expect(m).toContain('[2] Item · AMC\ntwo');
    expect(m.endsWith('Question: Mehta ka rate?')).toBe(true);
    expect(citationsIn('Rate ₹3,500 tha [2], bill [2] [9] [1].', 2)).toEqual([2, 1]);
    expect(renumberCitations('Rate ₹3,500 tha [2], bill [7] mein.', [2])).toBe('Rate ₹3,500 tha [1], bill mein.');
  });
});
