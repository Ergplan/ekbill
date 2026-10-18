import { describe, expect, it } from 'vitest';

import {
  emptyForm,
  customerNamed,
  fromText,
  milestonesOf,
  planFrom,
  prefillOf,
  type HelpForm,
} from '../../apps/web/screens/help/plan';

/** Stage 9, the contract helper: the owner's answers through the salvaged engine to the bill's one line. */
const RATES = [0, 5, 12, 18, 28];
const opts = {
  chargesGst: true,
  allowedRates: RATES,
  at: { dateIso: '2026-10-15', sellerStateCode: '27', customerStateCode: '27' },
};
const base = (over: Partial<HelpForm>): HelpForm => ({
  ...emptyForm('percent', true, 18),
  customer: 'c1',
  name: 'Green Park wiring',
  total: '5 lakh',
  ...over,
});

describe('a percentage of a contract', () => {
  it('30-40-30 on ₹5,00,000 + 18 %: the advance is ₹1,50,000 + ₹27,000', () => {
    const p = planFrom(base({}), opts);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.bill).toMatchObject({
      basisPaise: 15000000,
      linePaise: 15000000,
      gstPaise: 2700000,
      totalPaise: 17700000,
    });
    expect(p.bill.description).toBe('Green Park wiring - Advance (instalment 1 of 3: 30% of contract value ₹5,00,000)');
    expect(prefillOf(p)).toEqual({
      lines: [{ what: p.bill.description, qty: '1', rate: '150000' }],
      gstRate: 18,
      gstOn: true,
    });
  });

  it('the last instalment is what is left; one already billed is refused', () => {
    const last = planFrom(
      base({
        milestones: [
          { label: 'A', pct: '33.33' },
          { label: 'B', pct: '33.33' },
          { label: 'C', pct: '33.34' },
        ],
        billIndex: 2,
        billed: [true, true],
      }),
      opts,
    );
    expect(last.ok && last.bill.basisPaise).toBe(50000000 - 2 * 16665000);
    const again = planFrom(base({ billIndex: 0, billed: [true] }), opts);
    expect(again).toMatchObject({ ok: false, message: { key: 'help.alreadyBilled' } });
  });

  it('instalments that do not add up to 100 % say so', () => {
    const p = planFrom(
      base({
        milestones: [
          { label: 'A', pct: '30' },
          { label: 'B', pct: '30' },
        ],
      }),
      opts,
    );
    expect(p).toMatchObject({
      ok: false,
      field: 'milestones',
      message: { key: 'help.ms.sumWrong', params: { sum: '60' } },
    });
  });

  it('GST included: the line is the value before tax, the total stays the agreed share', () => {
    const p = planFrom(
      base({ gstMode: 'included', total: '118000', milestones: [{ label: 'All', pct: '100' }] }),
      opts,
    );
    expect(p.ok && p.bill).toMatchObject({ basisPaise: 11800000, linePaise: 10000000, gstPaise: 1800000 });
  });

  it('no GST on the contract: the bill opens with GST off', () => {
    const p = planFrom(base({ gstMode: 'none', gstRate: null }), opts);
    expect(p.ok && prefillOf(p)).toMatchObject({ gstOn: false, gstRate: null });
  });
});

describe('instalments and a running bill', () => {
  it('four equal instalments, the last one taking the paisa', () => {
    expect(milestonesOf(base({ kind: 'instalments', count: '3' })).map((m) => m.pctBp)).toEqual([3333, 3333, 3334]);
    const p = planFrom(
      base({ kind: 'instalments', count: '4', total: '100000', billIndex: 3, billed: [true, true, true] }),
      opts,
    );
    expect(p.ok && p.bill.basisPaise).toBe(2500000);
  });

  it('work done to 60 %, ₹2,00,000 billed before: this bill is ₹1,00,000', () => {
    const p = planFrom(base({ kind: 'running', donePct: '60', before: '2 lakh', retention: '5' }), opts);
    expect(p.ok && p.bill).toMatchObject({ basisPaise: 10000000, retentionPaise: Math.round(11800000 * 0.05) });
    expect(p.ok && p.bill.description).toBe(
      'Green Park wiring - running bill 2: work completed to 60% of contract value ₹5,00,000',
    );
  });

  it('nothing new to bill, or billed-before above the contract, is refused', () => {
    expect(planFrom(base({ kind: 'running', donePct: '40', before: '2 lakh' }), opts)).toMatchObject({
      ok: false,
      message: { key: 'help.nothingToBill' },
    });
    expect(planFrom(base({ kind: 'running', donePct: '40', before: '9 lakh' }), opts)).toMatchObject({
      ok: false,
      field: 'before',
    });
  });

  it('with no job name typed, the job is the customer: their name, not a refusal (the walkthrough, 18 Oct)', () => {
    const named = planFrom(base({ name: '' }), { ...opts, customerName: 'Green Park Society' });
    expect(named.ok).toBe(true);
    if (named.ok) expect(prefillOf(named).lines[0]!.what).toMatch(/^Green Park Society - /);
    expect(planFrom(base({ name: '' }), opts)).toMatchObject({ ok: false, field: 'name' });
  });

  it('asks for the customer first', () => {
    expect(planFrom(base({ customer: null }), opts)).toMatchObject({ ok: false, field: 'customer' });
  });
});

describe('a pasted contract', () => {
  it('fills what it can read and counts it', () => {
    const { form, found } = fromText(
      emptyForm('running', true, 18),
      'Contract for Green Park Society wiring worth Rs 5,00,000 plus GST @ 18%. 30% advance, 40% on delivery, 30% on installation. 5% retention.',
      RATES,
    );
    expect(found).toBeGreaterThanOrEqual(4);
    expect(form).toMatchObject({ kind: 'percent', total: '500000', gstMode: 'extra', gstRate: 18, retention: '5' });
    expect(form.milestones.map((m) => m.pct)).toEqual(['30', '40', '30']);
  });

  // The walkthrough (18 Oct): the text named the customer and the owner still had to pick them from the list.
  it('chooses the known customer the text names, never one already chosen or a name inside another word', () => {
    const known = [
      { id: 'g', name: 'Green Park Society' },
      { id: 'p', name: 'Green Park' },
      { id: 'm', name: 'Mehta Traders' },
      { id: 'r', name: 'Ram' },
    ];
    const text = 'Contract for Green Park Society wiring worth Rs 5,00,000. 30% advance, 70% on completion.';
    expect(fromText(emptyForm('percent', true, 18), text, RATES, known).form.customer).toBe('g');
    expect(fromText({ ...emptyForm('percent', true, 18), customer: 'm' }, text, RATES, known).form.customer).toBe('m');
    expect(customerNamed('Mehta-Traders ka kaam', known)).toBe('m');
    expect(customerNamed('MEHTA TRADERS, Nagpur', known)).toBe('m');
    expect(customerNamed('Ramesh ka kaam', known)).toBeNull();
    expect(customerNamed('nothing here', known)).toBeNull();
  });
});

describe('the helper’s figures are the bill’s (I4, Stage 3 review)', () => {
  it.each([
    ['extra', '1,00,001'],
    ['included', '1,00,001'],
    ['included', '3,33,333'],
  ] as const)('GST %s on ₹%s: the total and GST are computeTax’s on the prefilled line', async (gstMode, total) => {
    const { computeTax, parseMoney } = await import('../../packages/engine/src/index');
    const p = planFrom(base({ gstMode, gstRate: 18, total, milestones: [{ label: 'All', pct: '100' }] }), opts);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const pre = prefillOf(p);
    const tax = computeTax({
      lines: [{ description: 'x', quantityMilli: 1000, unitPricePaise: parseMoney(pre.lines[0]!.rate), gstBp: 1800 }],
      registration: 'regular',
      gstOn: true,
      dateIso: '2026-10-15',
      sellerStateCode: '27',
      customerStateCode: '27',
    });
    expect({ total: p.bill.totalPaise, gst: p.bill.gstPaise }).toEqual({ total: tax.totalPaise, gst: tax.gstPaise });
  });
});
