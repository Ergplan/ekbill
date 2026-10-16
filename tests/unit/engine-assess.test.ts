import { describe, expect, it } from 'vitest';

import {
  assessDocument,
  type AssessBusiness,
  type AssessCustomer,
  type AssessDocument,
} from '../../packages/engine/src/assess';
import { GST_RULES } from '../../packages/engine/src/rules';

/**
 * Salvaged from the MVP's tests/unit/tax-engine.test.ts "issuance assessment"
 * (tag mvp-final) and extended for the Stage 3 checks, each citing its rule
 * entry. The MVP refused composition businesses; v2 issues their bills of
 * supply with the legend (that test is adapted, not dropped).
 */
const business: AssessBusiness = {
  registration: 'regular',
  gstin: '27AAPFU0939F1ZV',
  stateCode: '27',
  turnoverPaise: 5000000000,
  eInvoiceSelfDeclaredNotApplicable: true,
};
const customer: AssessCustomer = {
  name: 'Mehta Traders',
  gstin: '27AAPFU0939F1ZV'.replace('AAPFU0939F', 'AABCG1234H').replace(/.$/, 'Z'),
  stateCode: '27',
  address: '12, Dharampeth, Nagpur',
};
const walkIn: AssessCustomer = { name: 'Priya', gstin: null, stateCode: null, address: null };
const document = (patch: Partial<AssessDocument> = {}): AssessDocument => ({
  kind: 'bill',
  dateIso: '2026-09-24',
  gstOn: true,
  placeOfSupplyStateCode: '27',
  lines: [{ description: 'AMC visit', gstBp: 1800, taxRateChosen: true, hsnCode: '9987' }],
  flags: [],
  totals: { totalPaise: 413000, supply: 'intra' },
  ...patch,
});
const today = '2026-10-15';
const codes = (a: ReturnType<typeof assessDocument>) => a.blockers.map((b) => b.code);
const assess = (b: Partial<AssessBusiness> = {}, c: AssessCustomer = customer, d: Partial<AssessDocument> = {}) =>
  assessDocument({ business: { ...business, ...b }, customer: c, document: document(d), today });

describe('issuance assessment', () => {
  it('allows an ordinary domestic supply by a regular registrant, and names the rules it read', () => {
    const a = assess();
    expect(a.canIssue).toBe(true);
    expect(a.title).toBe('TAX INVOICE');
    expect(a.chargesGst).toBe(true);
    expect(a.ruleIds).toEqual(
      expect.arrayContaining(['document-kinds-2017', 'hsn-digits-2021', 'e-invoice-threshold-2023']),
    );
  });
  it('allows an unregistered business to bill without GST', () => {
    const a = assess({ registration: 'unregistered', gstin: null });
    expect(a.canIssue).toBe(true);
    expect(a.title).toBe('INVOICE');
    expect(a.chargesGst).toBe(false);
    expect(a.notices.map((n) => n.code)).toContain('unregistered-no-gst');
  });
  it('a registered business can make one bill without GST: a bill of supply (s. 31(3)(c)), no tax lines, no legend', () => {
    const a = assess({}, walkIn, {
      gstOn: false,
      placeOfSupplyStateCode: null,
      lines: [{ description: 'A', gstBp: 0, taxRateChosen: true, hsnCode: null }],
    });
    expect(a.canIssue).toBe(true);
    expect(a.kind).toBe('bill-of-supply');
    expect(a.title).toBe('BILL OF SUPPLY');
    expect(a.legend).toBeNull();
    expect(a.chargesGst).toBe(false);
  });
  it('a composition business issues a bill of supply with the legend, and may not charge tax (adapted: the MVP refused composition)', () => {
    const a = assess({ registration: 'composition' }, walkIn, {
      gstOn: false,
      lines: [{ description: 'Rice', gstBp: 0, taxRateChosen: true, hsnCode: null }],
    });
    expect(a.canIssue).toBe(true);
    expect(a.kind).toBe('bill-of-supply');
    expect(a.legend).toBe('composition taxable person, not eligible to collect tax on supplies');
    expect(a.notices.map((n) => n.code)).toContain('composition-legend');
    const taxed = assess({ registration: 'composition' }, walkIn, {
      lines: [{ description: 'Rice', gstBp: 500, taxRateChosen: true, hsnCode: null }],
    });
    expect(codes(taxed)).toContain('composition-tax');
    expect(taxed.blockers[0]!.ruleId).toBe('composition-limits-2019');
  });
  it('a composition business may not supply to another State (s. 10(2)(c)); its own State is fine', () => {
    const plain = { gstOn: false, lines: [{ description: 'Rice', gstBp: 0, taxRateChosen: true, hsnCode: null }] };
    const out = assess({ registration: 'composition' }, walkIn, {
      ...plain,
      placeOfSupplyStateCode: '23',
      totals: { totalPaise: 10000, supply: 'inter' },
    });
    expect(out.canIssue).toBe(false);
    expect(codes(out)).toEqual(['composition-inter-state']);
    expect(out.blockers[0]!.ruleId).toBe('composition-limits-2019');
    expect(out.blockers[0]!.whatYouCanDo.key).toBe('assess.composition-inter-state.do');
    expect(assess({ registration: 'composition' }, walkIn, plain).canIssue).toBe(true);
    // A regular business may.
    expect(codes(assess({}, walkIn, { totals: { totalPaise: 10000, supply: 'inter' } }))).not.toContain(
      'composition-inter-state',
    );
  });
  it('blocks until the GST status is known', () => {
    const a = assess({ registration: 'unknown' });
    expect(a.canIssue).toBe(false);
    expect(codes(a)).toContain('gst-status-unconfirmed');
    expect(a.blockers[0]!.whatYouCanDo.key).toBe('assess.gst-status-unconfirmed.do');
  });
  it.each(['export', 'sez', 'reverse-charge', 'advance-receipt', 'non-gst-supply'] as const)(
    'blocks an unsupported supply type: %s',
    (flag) => {
      const a = assess({}, customer, { flags: [flag] });
      expect(a.canIssue).toBe(false);
      expect(codes(a)).toContain(`unsupported-${flag}`);
    },
  );
  it('blocks a regular registrant with no GSTIN, no state or no confirmed place of supply', () => {
    expect(codes(assess({ gstin: null }))).toContain('missing-gstin');
    expect(codes(assess({ stateCode: null }))).toContain('missing-seller-state');
    expect(codes(assess({}, customer, { placeOfSupplyStateCode: null }))).toContain('missing-place-of-supply');
  });
  it('refuses a rate the law does not have on the bill’s date (selectable-rates-gst2), and keeps the old ones for old dates', () => {
    const at = (gstBp: number, dateIso: string) =>
      assess({}, customer, { dateIso, lines: [{ description: 'A', gstBp, taxRateChosen: true, hsnCode: '9987' }] });
    const twelve = at(1200, '2026-09-24');
    expect(codes(twelve)).toEqual(['rate-not-in-slabs']);
    expect(twelve.blockers[0]!.ruleId).toBe('selectable-rates-gst2');
    expect(twelve.blockers[0]!.message.params).toMatchObject({ n: 1, rates: '12', allowed: '0, 5, 18, 40' });
    expect(codes(at(1200, '2025-06-15'))).not.toContain('rate-not-in-slabs');
    expect(codes(at(4000, '2025-06-15'))).toContain('rate-not-in-slabs');
    for (const bp of [0, 25, 300, 500, 1800, 4000])
      expect(codes(at(bp, '2026-09-24'))).not.toContain('rate-not-in-slabs');
    // A bill without GST carries no rate to check.
    expect(
      codes(
        assess({}, walkIn, {
          gstOn: false,
          lines: [{ description: 'A', gstBp: 1200, taxRateChosen: true, hsnCode: null }],
        }),
      ),
    ).not.toContain('rate-not-in-slabs');
  });
  it('refuses to print a tax invoice with a rate nobody chose, and counts them', () => {
    const a = assess({}, customer, {
      lines: [
        { description: 'A', gstBp: 0, taxRateChosen: false, hsnCode: '9987' },
        { description: 'B', gstBp: 0, taxRateChosen: false, hsnCode: '9987' },
      ],
    });
    expect(codes(a)).toContain('rate-not-chosen');
    expect(a.blockers.find((b) => b.code === 'rate-not-chosen')!.message.params).toEqual({ n: 2 });
  });
  it('allows a bill where every rate was answered, including a deliberate 0%, and says it should be a bill of supply', () => {
    const a = assess({}, customer, { lines: [{ description: 'A', gstBp: 0, taxRateChosen: true, hsnCode: '9987' }] });
    expect(a.canIssue).toBe(true);
    expect(a.notices.map((n) => n.code)).toContain('nil-rated-on-tax-invoice');
  });
  it('does not ask a business that charges no GST for a rate', () => {
    const a = assess({ registration: 'unregistered', gstin: null }, walkIn, {
      lines: [{ description: 'A', gstBp: 0, taxRateChosen: false, hsnCode: null }],
    });
    expect(a.canIssue).toBe(true);
  });
  it('e-invoicing: unscreened blocks, self-declared passes, above the threshold blocks, exempt passes (e-invoice-threshold-2023)', () => {
    expect(codes(assess({ turnoverPaise: null, eInvoiceSelfDeclaredNotApplicable: false }))).toContain(
      'e-invoicing-unscreened',
    );
    expect(assess({ turnoverPaise: null, eInvoiceSelfDeclaredNotApplicable: true }).canIssue).toBe(true);
    const big = assess({ turnoverPaise: 6000000000, eInvoiceSelfDeclaredNotApplicable: false });
    expect(codes(big)).toContain('e-invoicing-applicable');
    expect(big.blockers.find((b) => b.code === 'e-invoicing-applicable')!.ruleId).toBe('e-invoice-threshold-2023');
    // The owner said "Nahi" under Aap: their answer stands, with a notice, whatever the band says.
    expect(codes(assess({ turnoverPaise: 6000000000, eInvoiceSelfDeclaredNotApplicable: true }))).not.toContain(
      'e-invoicing-applicable',
    );
    // A bank above the threshold: exempt from e-invoicing, though as a large
    // business it still owes six HSN digits (hsn-digits-2021).
    const bank = assess({ turnoverPaise: 6000000000, eInvoiceExemption: 'bank' }, customer, {
      lines: [{ description: 'Locker rent', gstBp: 1800, taxRateChosen: true, hsnCode: '997119' }],
    });
    expect(codes(bank)).not.toContain('e-invoicing-applicable');
    expect(bank.canIssue).toBe(true);
  });
  it('e-invoicing is for B2B only (scope b2b): a walk-in’s bill neither blocks nor is noted', () => {
    for (const b of [
      { turnoverPaise: null, eInvoiceSelfDeclaredNotApplicable: false },
      { turnoverPaise: 6000000000, eInvoiceSelfDeclaredNotApplicable: false },
      { turnoverPaise: 6000000000, eInvoiceSelfDeclaredNotApplicable: true },
    ]) {
      const a = assess(b, walkIn, { totals: { totalPaise: 413000, supply: 'intra' } });
      expect(a.blockers.map((x) => x.code).filter((c) => c.startsWith('e-invoicing') || c.startsWith('irn'))).toEqual(
        [],
      );
      expect(a.notices.map((n) => n.code)).not.toContain('e-invoicing-self-declared');
    }
    expect(codes(assess({ turnoverPaise: 6000000000, eInvoiceSelfDeclaredNotApplicable: false }))).toContain(
      'e-invoicing-applicable',
    );
  });
  it('the 30-day IRN window (irn-30-day-2025): a ₹10 crore business cannot report a bill older than 30 days', () => {
    const a = assess({ turnoverPaise: 12000000000, eInvoiceSelfDeclaredNotApplicable: false }, customer, {
      dateIso: '2026-09-01',
    });
    expect(codes(a)).toContain('irn-window-passed');
    expect(
      codes(
        assess({ turnoverPaise: 12000000000, eInvoiceSelfDeclaredNotApplicable: false }, customer, {
          dateIso: '2026-10-01',
        }),
      ),
    ).not.toContain('irn-window-passed');
  });
  it('HSN digits by turnover band (hsn-digits-2021): short codes block, absent codes are said', () => {
    const short = assess({}, customer, {
      lines: [{ description: 'A', gstBp: 1800, taxRateChosen: true, hsnCode: '99' }],
    });
    expect(codes(short)).toContain('hsn-too-short');
    expect(short.blockers.find((b) => b.code === 'hsn-too-short')!.message.params).toEqual({ digits: 4, n: 1 });
    const absent = assess({}, customer, {
      lines: [{ description: 'A', gstBp: 1800, taxRateChosen: true, hsnCode: null }],
    });
    expect(absent.canIssue).toBe(true);
    expect(absent.notices.map((n) => n.code)).toContain('hsn-missing');
    // Above ₹5 crore: six digits everywhere, B2C included.
    const big = assess({ turnoverPaise: 6000000000, eInvoiceExemption: 'bank' }, walkIn, {
      lines: [{ description: 'A', gstBp: 1800, taxRateChosen: true, hsnCode: '9987' }],
      placeOfSupplyStateCode: '27',
    });
    expect(big.blockers.find((b) => b.code === 'hsn-too-short')!.message.params).toEqual({ digits: 6, n: 1 });
  });
  it('B2C of ₹50,000 or more needs the name, address and state (b2c-recipient-details-r46)', () => {
    const a = assess({}, walkIn, { totals: { totalPaise: 5000000, supply: 'intra' } });
    expect(codes(a)).toContain('b2c-recipient-details');
    expect(a.blockers.find((b) => b.code === 'b2c-recipient-details')!.ruleId).toBe('b2c-recipient-details-r46');
    expect(
      assess(
        {},
        { ...walkIn, address: 'Sitabuldi', stateCode: '27' },
        { totals: { totalPaise: 5000000, supply: 'intra' } },
      ).canIssue,
    ).toBe(true);
    expect(assess({}, walkIn, { totals: { totalPaise: 4999999, supply: 'intra' } }).canIssue).toBe(true);
  });
  it('a credit note must link its invoice and reduce tax within the date limit (credit-note-declare-limit)', () => {
    expect(codes(assess({}, customer, { kind: 'credit-note', linkedInvoice: null }))).toContain('credit-note-unlinked');
    const late = assess({}, customer, {
      kind: 'credit-note',
      linkedInvoice: { number: 'INV-001', dateIso: '2024-06-01' },
    });
    expect(codes(late)).toContain('credit-note-late');
    expect(late.blockers.find((b) => b.code === 'credit-note-late')!.message.params).toMatchObject({
      date: '2025-11-30',
      number: 'INV-001',
    });
    const inTime = assess({}, customer, {
      kind: 'credit-note',
      linkedInvoice: { number: 'INV-002', dateIso: '2026-06-01' },
    });
    expect(inTime.canIssue).toBe(true);
    expect(inTime.title).toBe('CREDIT NOTE');
  });
  it('refuses a customer GSTIN that is the business’s own', () => {
    expect(codes(assess({}, { ...customer, gstin: business.gstin }))).toContain('self-billing');
  });
  it('reads a custom pack when one is passed', () => {
    const stricter = {
      ...GST_RULES,
      entries: GST_RULES.entries.map((e) =>
        e.id === 'b2c-recipient-details-r46' ? { ...e, thresholdPaise: 100000 } : e,
      ),
    };
    const a = assessDocument(
      { business, customer: walkIn, document: document({ totals: { totalPaise: 200000, supply: 'intra' } }), today },
      stricter,
    );
    expect(codes(a)).toContain('b2c-recipient-details');
  });
});

/** Stage 8: every check the bill form shows (with "Kyun?"), each with a passing and a failing case. */
describe('the bill form checks, pass and fail', () => {
  const notes = (a: ReturnType<typeof assessDocument>) => a.notices.map((n) => n.code);

  it('reverse charge is not issued in this release; an ordinary supply is', () => {
    expect(codes(assess({}, customer, { flags: ['reverse-charge'] }))).toContain('unsupported-reverse-charge');
    expect(codes(assess())).not.toContain('unsupported-reverse-charge');
  });

  it('a regular business switching GST off is told it makes a bill of supply', () => {
    expect(notes(assess({}, customer, { gstOn: false }))).toContain('gst-off-bill-of-supply');
    expect(notes(assess())).not.toContain('gst-off-bill-of-supply');
  });

  it('a self-declared e-invoicing exemption is noted, not blocked', () => {
    const big = { turnoverPaise: 600_000_000_00, eInvoiceSelfDeclaredNotApplicable: true };
    const a = assess(big);
    expect(notes(a)).toContain('e-invoicing-self-declared');
    expect(codes(a)).not.toContain('e-invoicing-applicable');
    expect(notes(assess({ turnoverPaise: 100_000_00 }))).not.toContain('e-invoicing-self-declared');
  });

  it("the customer's GSTIN state against the place of supply is asked about, never refused", () => {
    const a = assess({}, customer, { placeOfSupplyStateCode: '24' });
    expect(a.canIssue).toBe(true);
    expect(a.notices).toContainEqual(
      expect.objectContaining({
        code: 'gstin-state-differs',
        ruleId: 'place-of-supply-state',
        message: { key: 'assess.gstin-state-differs', params: { gstinState: '27', pos: '24' } },
      }),
    );
    expect(notes(assess())).not.toContain('gstin-state-differs');
    expect(notes(assess({}, walkIn, { placeOfSupplyStateCode: '24' }))).not.toContain('gstin-state-differs');
  });

  it('a bill dated within a month of a rate change says its own date decides the rates', () => {
    const before = assess({}, customer, { dateIso: '2025-09-15' });
    expect(before.notices).toContainEqual(
      expect.objectContaining({
        code: 'rates-by-date',
        ruleId: 'selectable-rates-2017',
        message: { key: 'assess.rates-by-date', params: { from: '2025-09-22' } },
      }),
    );
    const after = assess({}, customer, { dateIso: '2025-10-01' });
    expect(after.notices).toContainEqual(
      expect.objectContaining({ code: 'rates-by-date', ruleId: 'selectable-rates-gst2' }),
    );
    expect(notes(assess())).not.toContain('rates-by-date');
    expect(notes(assess({}, customer, { gstOn: false, dateIso: '2025-09-15' }))).not.toContain('rates-by-date');
  });

  it('every check with a rule has a "Kyun?" in both registers', async () => {
    const { explain } = await import('../../packages/engine/src/rules');
    const all = [
      assess({}, customer, { placeOfSupplyStateCode: '24' }),
      assess({}, customer, { dateIso: '2025-09-15' }),
      assess({ registration: 'composition', gstin: '27AAPFU0939F1ZV' }, walkIn, { gstOn: false }),
      assess({ turnoverPaise: 600_000_000_00, eInvoiceSelfDeclaredNotApplicable: true }),
    ];
    for (const x of all.flatMap((a) => [...a.blockers, ...a.notices]).filter((x) => x.ruleId)) {
      const e = explain(x.ruleId!);
      expect(e, x.code).not.toBeNull();
      expect(e!['hi-Latn'].length).toBeGreaterThan(10);
      expect(e!.en.length).toBeGreaterThan(10);
    }
  });
});
