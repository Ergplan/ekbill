import { beforeAll, describe, expect, it } from 'vitest';

import { toGstr1Json, type IssuedSnapshot, type IssueLine } from '../../packages/engine/src/index';
import * as documents from '../../packages/db/src/repos/documents';
import * as gst from '../../packages/db/src/repos/gst';
import { scopeFor, seeded } from './helpers';

/**
 * Stage 11, fourth review: a regular business that switches GST off on a bill issues a bill of supply
 * (s. 31(3)(c)), and that bill is a nil-rated or exempt supply in GSTR-1 (Table 8, and Table 13's range)
 * and in GSTR-3B 3.1(c). Before, it went out as a plain "invoice" and was left out of GSTR-1 altogether.
 * A composition dealer's bills of supply stay out: it files no GSTR-1.
 *
 * December 2025 of Sharma Electricals (no other test issues a bill in it):
 *   N1  Mehta Traders (registered, Maharashtra), GST off: ₹500            → Table 8 intra-State B2B ₹500
 *   N2  walk-in in Madhya Pradesh, GST off: ₹300                          → Table 8 inter-State B2C ₹300
 *   T   walk-in in Maharashtra, tax invoice: ₹1,000 at 18 % + ₹200 at 0 % → B2CS 18 % ₹1,000; Table 8 intra B2C ₹200
 */
const MEHTA = { name: 'Mehta Traders', gstin: '27AABCG1234H1ZZ', stateCode: '27' };
const line = (description: string, pricePaise: number, gstBp: number): IssueLine => ({
  description,
  quantityMilli: 1000,
  unitPricePaise: pricePaise,
  gstBp,
  taxRateChosen: true,
  hsnCode: '0713',
});
const MONTH = ['2025-12'];
let numbers: Record<'N1' | 'N2' | 'T', string>;
let n1Snapshot: IssuedSnapshot;

seeded();
beforeAll(async () => {
  const owner = await scopeFor('sharma', 'owner');
  const before = await gst.workingsFor(owner, MONTH);
  if (before.documents.length)
    throw new Error(`gst-nil.test.ts needs Sharma's ${MONTH[0]} to itself: ${before.documents.map((d) => d.number)}`);
  const issue = async (date: string, customer: documents.DraftCustomer, gstOn: boolean, lines: IssueLine[]) => {
    const d = await documents.createDraft(owner, {
      customer,
      dateIso: date,
      gstOn,
      placeOfSupplyStateCode: customer.stateCode,
      lines,
    });
    return documents.issueDocument(owner, { id: d.id, today: date });
  };
  const N1 = await issue('2025-12-05', MEHTA, false, [line('Dal (loose)', 50000, 0)]);
  const N2 = await issue('2025-12-06', { name: 'Bhopal walk-in', stateCode: '23' }, false, [
    line('Atta (loose)', 30000, 0),
  ]);
  const T = await issue('2025-12-07', { name: 'Counter sale', stateCode: '27' }, true, [
    line('Switch', 100000, 1800),
    line('Fresh vegetables', 20000, 0),
  ]);
  numbers = { N1: N1.number!, N2: N2.number!, T: T.number! };
  n1Snapshot = N1.issuedSnapshot as IssuedSnapshot;
});

describe('a regular business’s bill with GST off', () => {
  it('is a bill of supply: its own title, no tax, no composition legend', () => {
    expect(n1Snapshot.kind).toBe('bill-of-supply');
    expect(n1Snapshot.title).toBe('BILL OF SUPPLY');
    expect(n1Snapshot.legend).toBeNull();
    expect(n1Snapshot.totals.gstPaise).toBe(0);
  });

  it('is reported in Table 8 by supply type, in Table 13’s range, and in 3B’s 3.1(c)', async () => {
    const w = await gst.workingsFor(await scopeFor('sharma', 'accountant'), MONTH);
    expect(w.gstr1.nilExempt.map((r) => [r.supplyType, r.nilPaise])).toEqual([
      ['INTRAB2B', 50000],
      ['INTRB2C', 30000],
      ['INTRAB2C', 20000],
    ]);
    // B2B carries no 0 % document; the tax invoice's 18 % part is B2CS.
    expect(w.gstr1.b2b).toEqual([]);
    expect(w.gstr1.b2cSmall.map((r) => [r.gstBp, r.taxablePaise])).toEqual([[1800, 100000]]);
    const range = w.gstr1.documentSummary.filter((d) => d.docType === 'invoice');
    expect(range.reduce((n, d) => n + d.total, 0)).toBe(3);
    const issued = [numbers.N1, numbers.N2, numbers.T].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    expect(range[0]!.from).toBe(issued[0]);
    expect(range.at(-1)!.to).toBe(issued[2]);
    expect(w.gstr3b.nilRatedPaise).toBe(100000);
    // The taxable value is the taxed parts alone.
    expect(w.gstr1.totals.taxablePaise).toBe(100000);
    expect(w.gstr3b.taxable.taxablePaise).toBe(100000);
    const json = toGstr1Json({ gstin: '27AAAAA0000A1Z2', sellerStateCode: '27', tables: w.gstr1 });
    expect(json.nil?.inv).toEqual([
      { sply_ty: 'INTRAB2B', nil_amt: 500, expt_amt: 0, ngsup_amt: 0 },
      { sply_ty: 'INTRB2C', nil_amt: 300, expt_amt: 0, ngsup_amt: 0 },
      { sply_ty: 'INTRAB2C', nil_amt: 200, expt_amt: 0, ngsup_amt: 0 },
    ]);
  });

  it('a composition dealer’s bills of supply stay out of GSTR-1', async () => {
    const w = await gst.workingsFor(await scopeFor('gupta', 'owner'), ['2026-09', '2026-10']);
    expect(w.documents.length).toBeGreaterThan(0);
    expect(w.outward).toEqual([]);
    expect(w.gstr1.nilExempt).toEqual([]);
  });
});
