import { describe, expect, it } from 'vitest';

import {
  ESTIMATE_LEGEND,
  assessDocument,
  type AssessBusiness,
  type AssessDocument,
} from '../../packages/engine/src/assess';
import { prepareIssue, type IssueBusiness, type IssueCustomer } from '../../packages/engine/src/issue';
import { GST_RULES } from '../../packages/engine/src/rules';

/**
 * Kaccha bills (20 Oct, the operator: "estimates which are sent before the exact invoice, for the buyer to check;
 * some street vendors only give a kaccha bill"). An estimate is no supply's document: none of the invoice rules
 * stop it, but the GST it shows must still be right.
 */
const regular: AssessBusiness = {
  registration: 'regular',
  gstin: null,
  stateCode: null,
  turnoverPaise: null,
  eInvoiceSelfDeclaredNotApplicable: false,
};
const estimate = (patch: Partial<AssessDocument> = {}): AssessDocument => ({
  kind: 'estimate',
  dateIso: '2026-10-15',
  gstOn: true,
  placeOfSupplyStateCode: null,
  lines: [{ description: 'Wiring', gstBp: 1800, taxRateChosen: true, hsnCode: null }],
  flags: [],
  totals: { totalPaise: 9_000_000, supply: 'intra' },
  ...patch,
});
const walkIn = { name: 'Priya', gstin: null, stateCode: null, address: null };
const assess = (b: Partial<AssessBusiness>, d: Partial<AssessDocument> = {}) =>
  assessDocument({ business: { ...regular, ...b }, customer: walkIn, document: estimate(d), today: '2026-10-15' });

describe('a kaccha bill (estimate)', () => {
  it('needs none of the invoice rules: no GSTIN, no place of supply, no HSN, no ₹50,000 details, no e-invoice', () => {
    const a = assess({});
    expect(a.canIssue).toBe(true);
    expect(a.kind).toBe('estimate');
    expect(a.title).toBe('ESTIMATE');
    expect(a.legend).toBe(ESTIMATE_LEGEND);
    expect(a.blockers).toEqual([]);
    expect(a.notices.map((n) => n.code)).toEqual(['estimate-not-invoice']);
  });
  it('may be given by a seller who has not said whether they are registered (a street vendor)', () => {
    expect(assess({ registration: 'unknown' }, { gstOn: false }).canIssue).toBe(true);
    expect(assess({ registration: 'unregistered' }, { gstOn: false }).canIssue).toBe(true);
  });
  it('still shows only right GST: every rate chosen, and one the law has on its date', () => {
    expect(
      assess({}, { lines: [{ description: 'A', gstBp: 0, taxRateChosen: false, hsnCode: null }] }).blockers.map(
        (b) => b.code,
      ),
    ).toEqual(['rate-not-chosen']);
    expect(
      assess({}, { lines: [{ description: 'A', gstBp: 1200, taxRateChosen: true, hsnCode: null }] }).blockers.map(
        (b) => b.code,
      ),
    ).toEqual(['rate-not-in-slabs']);
  });
  it('from a composition dealer shows no GST', () => {
    expect(assess({ registration: 'composition' }).blockers.map((b) => b.code)).toEqual(['composition-tax']);
    expect(
      assess(
        { registration: 'composition' },
        { lines: [{ description: 'A', gstBp: 0, taxRateChosen: true, hsnCode: null }] },
      ).canIssue,
    ).toBe(true);
  });
  it('is prepared as an ESTIMATE snapshot, with its tax worked out and its legend', () => {
    const seller: IssueBusiness = {
      ...regular,
      registration: 'unknown',
      legalName: 'Ramu Chaat',
      tradeName: 'Ramu Chaat',
      address: null,
      city: 'Nagpur',
      phone: null,
      upi: 'ramu@upi',
    };
    const customer: IssueCustomer = { ...walkIn, id: null, phone: null };
    const p = prepareIssue(
      {
        kind: 'estimate',
        dateIso: '2026-10-15',
        gstOn: false,
        lines: [{ description: 'Pani puri', quantityMilli: 4000, unitPricePaise: 3000, gstBp: 0, taxRateChosen: true }],
        placeOfSupplyStateCode: null,
      },
      seller,
      customer,
      GST_RULES,
      '2026-10-15',
    );
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.kind).toBe('estimate');
    expect(p.snapshot.title).toBe('ESTIMATE');
    expect(p.snapshot.legend).toBe(ESTIMATE_LEGEND);
    expect(p.totals.totalPaise).toBe(12000);
    expect(p.totals.gstPaise).toBe(0);
  });
});
