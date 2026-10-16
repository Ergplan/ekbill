import { describe, expect, it } from 'vitest';

import {
  GST_RULES,
  computeTax,
  documentKind,
  documentKindRule,
  emptyTax,
  parseMoney,
  parseQuantity,
  placeOfSupply,
  selectableRates,
  supplyKind,
  type TaxInput,
} from '../../packages/engine/src/index';
import { compute as formPreview } from '../../apps/web/screens/bill/compute';

const line = (description: string, qty: string, price: string, pct: number) => ({
  description,
  quantityMilli: parseQuantity(qty),
  unitPricePaise: parseMoney(price),
  gstBp: pct * 100,
});
const DATE = '2026-10-15';
const intra: Omit<TaxInput, 'lines'> = {
  registration: 'regular',
  gstOn: true,
  dateIso: DATE,
  sellerStateCode: '27',
  customerStateCode: '27',
};
const inter: Omit<TaxInput, 'lines'> = { ...intra, customerStateCode: '23' };

describe('computeTax (I4: the one tax calculation)', () => {
  it('computes each head from the taxable value, never from a rounded sibling', () => {
    // ₹0.03 at 18 %: 3 paise × 9 % = 0.27 paise → 0 for each head (the old split gave 1 / 0).
    const r = computeTax({ ...intra, lines: [line('A', '1', '0.03', 18)] });
    expect(r.cgstPaise).toBe(0);
    expect(r.statePaise).toBe(0);
    expect(r.totalPaise).toBe(3);
    const big = computeTax({ ...intra, lines: [line('AMC', '1', '3500', 18), line('Fan', '2', '1350', 18)] });
    expect(big.subtotalPaise).toBe(620000);
    expect(big.cgstPaise).toBe(55800);
    expect(big.statePaise).toBe(55800);
    expect(big.totalPaise).toBe(731600);
    expect(big.stateHead).toBe('SGST');
    expect(big.heads).toEqual([
      { label: 'CGST 9%', paise: 55800 },
      { label: 'SGST 9%', paise: 55800 },
    ]);
    expect(big.rulesApplied).toEqual(['place-of-supply-state', 'document-kinds-2017']);
  });
  it('keeps half rates exact: an odd basis-point rate is not truncated at the head', () => {
    // 1.01 % on ₹1000: 100000 × 101 / 20000 = 505 paise for each head, not 500 (bp/2 truncated to 50).
    const r = computeTax({ ...intra, lines: [{ ...line('A', '1', '1000', 0), gstBp: 101 }] });
    expect(r.cgstPaise).toBe(505);
    expect(r.statePaise).toBe(505);
    expect(r.gstPaise).toBe(1010);
    expect(computeTax({ ...inter, lines: [{ ...line('A', '1', '1000', 0), gstBp: 101 }] }).igstPaise).toBe(1010);
  });
  it('charges IGST across states and nothing for composition, unregistered or GST switched off', () => {
    const r = computeTax({ ...inter, lines: [line('A', '1', '1000', 18)] });
    expect(r.supply).toBe('inter');
    expect(r.igstPaise).toBe(18000);
    expect(r.cgstPaise + r.statePaise).toBe(0);
    expect(r.heads).toEqual([{ label: 'IGST 18%', paise: 18000 }]);
    for (const registration of ['composition', 'unregistered', 'unknown'] as const) {
      const x = computeTax({ ...intra, registration, lines: [line('A', '1', '1000', 18)] });
      expect(x.gstPaise).toBe(0);
      expect(x.totalPaise).toBe(100000);
      expect(x.heads).toEqual([]);
    }
    expect(computeTax({ ...intra, gstOn: false, lines: [line('A', '1', '1000', 18)] }).gstPaise).toBe(0);
    expect(computeTax({ ...intra, registration: 'composition', gstOn: false, lines: [] }).documentKind).toBe(
      'bill-of-supply',
    );
  });
  it('names the state head UTGST in a union territory', () => {
    const r = computeTax({
      ...intra,
      sellerStateCode: '04',
      customerStateCode: '04',
      lines: [line('A', '1', '100', 18)],
    });
    expect(r.stateHead).toBe('UTGST');
    expect(r.heads.map((h) => h.label)).toEqual(['CGST 9%', 'UTGST 9%']);
  });
  it('a line without a description carries no value, so the paper and the total agree', () => {
    const r = computeTax({ ...intra, lines: [line('A', '1', '100', 18), line('', '1', '200', 18)] });
    expect(r.subtotalPaise).toBe(10000);
    expect(r.lines[1]?.blank).toBe(true);
  });
  it('rates per line are honoured', () => {
    const r = computeTax({ ...intra, lines: [line('A', '1', '100', 5), line('B', '1', '100', 18)] });
    expect(r.lines.map((l) => l.cgstPaise + l.statePaise)).toEqual([500, 1800]);
    expect(r.heads.map((h) => h.label)).toEqual(['CGST', 'SGST']);
  });
  it('refuses an unsafe product instead of returning a wrong total', () => {
    expect(() => computeTax({ ...intra, lines: [line('A', '100000000', '100000000', 18)] })).toThrow();
  });
  it('refuses a date before any rule pack applies', () => {
    expect(() => computeTax({ ...intra, dateIso: '2016-01-01', lines: [line('A', '1', '100', 18)] })).toThrow();
  });
});

describe('the rule pack (I5)', () => {
  it('selects rates by document date', () => {
    expect(selectableRates('2025-09-21')).toEqual([0, 5, 12, 18, 28]);
    expect(selectableRates('2025-09-22')).toEqual([0, 5, 18, 40]);
    expect(selectableRates('2026-10-15')).toEqual([0, 5, 18, 40]);
    expect(selectableRates('2016-01-01')).toEqual([]);
  });
  it('decides place of supply by state code, on the date', () => {
    expect(supplyKind('27', '27', DATE)).toBe('intra');
    expect(supplyKind('27', '23', DATE)).toBe('inter');
    expect(supplyKind('27', null, DATE)).toBe('intra');
    expect(placeOfSupply('27', '27', DATE)).toMatchObject({ supply: 'intra', stateHead: 'SGST' });
    expect(placeOfSupply('04', '04', DATE)).toMatchObject({ supply: 'intra', stateHead: 'UTGST' });
  });
  it('decides the document kind from the pack, not from code', () => {
    expect(documentKind('regular', true, DATE)).toBe('tax-invoice');
    expect(documentKind('regular', false, DATE)).toBe('invoice');
    expect(documentKind('composition', true, DATE)).toBe('bill-of-supply');
    expect(documentKind('unregistered', true, DATE)).toBe('invoice');
    expect(documentKind('unknown', true, DATE)).toBe('invoice');
  });
  it('reads the place-of-supply decision from the pack, not from code', () => {
    const entry = GST_RULES.entries.find((e) => e.id === 'place-of-supply-state')!;
    const flipped = {
      ...GST_RULES,
      entries: GST_RULES.entries.map((e) =>
        e.id === entry.id
          ? {
              ...e,
              decide: { sameState: 'inter' as const, otherState: 'intra' as const, unknownState: 'inter' as const },
            }
          : e,
      ),
    };
    expect(placeOfSupply('27', '27', DATE, flipped).supply).toBe('inter');
    expect(placeOfSupply('27', '23', DATE, flipped).supply).toBe('intra');
    expect(placeOfSupply('27', null, DATE, flipped).supply).toBe('inter');
    expect(computeTax({ ...intra, rules: flipped, lines: [line('A', '1', '100', 18)] }).igstPaise).toBe(1800);
  });
  it('names the entries that decided a result, and the empty result names none', () => {
    expect(documentKindRule('composition', true, DATE)).toEqual({
      kind: 'bill-of-supply',
      ruleId: 'document-kinds-2017',
    });
    expect(emptyTax()).toMatchObject({ totalPaise: 0, heads: [], rulesApplied: [] });
  });
});

/**
 * Twenty fixtures through the one engine (I4): the figures a bill prints,
 * the snapshot an issued document keeps, and the GSTR-1 table built from
 * that snapshot are the same numbers, because the same code produced them.
 */
import { prepareIssue, type IssueBusiness, type IssueCustomer } from '../../packages/engine/src/issue';
import { buildGstr1, outwardDocumentsFromSnapshots } from '../../packages/engine/src/workings';

interface Fixture {
  name: string;
  input: TaxInput;
  expect: Partial<
    Pick<
      TaxResult20,
      | 'subtotalPaise'
      | 'cgstPaise'
      | 'statePaise'
      | 'igstPaise'
      | 'cessPaise'
      | 'gstPaise'
      | 'totalPaise'
      | 'roundOffPaise'
      | 'grossPaise'
      | 'discountPaise'
      | 'supply'
      | 'stateHead'
      | 'documentKind'
    >
  > & {
    heads?: Array<{ label: string; paise: number }>;
  };
  /** When the fixture is also issued: the customer, with what the thresholds need. */
  customer?: Partial<IssueCustomer>;
  /** When issuing this fixture is rightly refused: the blocker's code. */
  refused?: string;
}
type TaxResult20 = ReturnType<typeof computeTax>;

const L = (description: string, pricePaise: number, gstBp: number, extra: Record<string, unknown> = {}) => ({
  description,
  quantityMilli: 1000,
  unitPricePaise: pricePaise,
  gstBp,
  ...extra,
});
const FIXTURES: Fixture[] = [
  {
    name: '1 one line at 18% within the state',
    input: { ...intra, lines: [L('AMC visit', 100000, 1800)] },
    expect: {
      subtotalPaise: 100000,
      cgstPaise: 9000,
      statePaise: 9000,
      gstPaise: 18000,
      totalPaise: 118000,
      supply: 'intra',
      documentKind: 'tax-invoice',
      heads: [
        { label: 'CGST 9%', paise: 9000 },
        { label: 'SGST 9%', paise: 9000 },
      ],
    },
  },
  {
    name: '2 the same line to another state',
    input: { ...inter, lines: [L('AMC visit', 100000, 1800)] },
    expect: {
      igstPaise: 18000,
      cgstPaise: 0,
      statePaise: 0,
      totalPaise: 118000,
      supply: 'inter',
      heads: [{ label: 'IGST 18%', paise: 18000 }],
    },
    customer: { stateCode: '23' },
  },
  {
    name: '3 mixed rates, 5% and 18%',
    input: { ...intra, lines: [L('Rice', 100000, 500), L('Fan', 200000, 1800)] },
    expect: {
      subtotalPaise: 300000,
      cgstPaise: 20500,
      statePaise: 20500,
      gstPaise: 41000,
      totalPaise: 341000,
      heads: [
        { label: 'CGST', paise: 20500 },
        { label: 'SGST', paise: 20500 },
      ],
    },
  },
  {
    name: '4 a price that includes tax',
    input: { ...intra, lines: [L('Service', 118000, 1800, { priceIncludesTax: true })] },
    expect: { grossPaise: 118000, subtotalPaise: 100000, gstPaise: 18000, totalPaise: 118000 },
  },
  {
    name: '5 a discount before tax',
    input: { ...intra, lines: [L('Fan', 100000, 1800, { discountPaise: 10000 })] },
    expect: {
      grossPaise: 100000,
      discountPaise: 10000,
      subtotalPaise: 90000,
      cgstPaise: 8100,
      statePaise: 8100,
      totalPaise: 106200,
    },
  },
  {
    name: '6 cess on top of 28%',
    input: { ...intra, lines: [L('Aerated drink', 100000, 2800, { cessBp: 1200 })] },
    expect: {
      cgstPaise: 14000,
      statePaise: 14000,
      cessPaise: 12000,
      gstPaise: 40000,
      totalPaise: 140000,
      heads: [
        { label: 'CGST 14%', paise: 14000 },
        { label: 'SGST 14%', paise: 14000 },
        { label: 'Cess', paise: 12000 },
      ],
    },
  },
  {
    name: '7 rounded down to the rupee',
    input: { ...intra, roundToRupee: true, lines: [L('Part', 10033, 1800)] },
    expect: {
      cgstPaise: 903,
      statePaise: 903,
      roundOffPaise: -39,
      totalPaise: 11800,
      heads: [
        { label: 'CGST 9%', paise: 903 },
        { label: 'SGST 9%', paise: 903 },
        { label: 'Round off', paise: -39 },
      ],
    },
  },
  {
    name: '8 rounded up to the rupee',
    input: { ...intra, roundToRupee: true, lines: [L('Part', 10066, 1800)] },
    expect: { cgstPaise: 906, statePaise: 906, roundOffPaise: 22, totalPaise: 11900 },
  },
  {
    name: '9 a quantity in parts',
    input: { ...intra, lines: [{ ...L('Cable', 10000, 1800), quantityMilli: 2500 }] },
    expect: { grossPaise: 25000, cgstPaise: 2250, statePaise: 2250, totalPaise: 29500 },
  },
  {
    name: '10 a union territory names UTGST',
    input: { ...intra, sellerStateCode: '04', customerStateCode: '04', lines: [L('Repair', 10000, 1800)] },
    expect: {
      stateHead: 'UTGST',
      cgstPaise: 900,
      statePaise: 900,
      heads: [
        { label: 'CGST 9%', paise: 900 },
        { label: 'UTGST 9%', paise: 900 },
      ],
    },
  },
  {
    name: '11 a composition business charges nothing',
    input: { ...intra, registration: 'composition', lines: [L('Sweets', 100000, 0)] },
    expect: { gstPaise: 0, totalPaise: 100000, documentKind: 'bill-of-supply', heads: [] },
  },
  {
    name: '12 an unregistered business charges nothing',
    input: { ...intra, registration: 'unregistered', lines: [L('Tuition', 100000, 1800)] },
    expect: { gstPaise: 0, totalPaise: 100000, documentKind: 'invoice', heads: [] },
  },
  {
    name: '13 a registered business with GST off for this bill',
    input: { ...intra, gstOn: false, lines: [L('Scrap', 100000, 1800)] },
    expect: { gstPaise: 0, totalPaise: 100000, documentKind: 'invoice', heads: [] },
  },
  {
    name: '14 a nil-rated line on a tax invoice',
    input: { ...intra, lines: [L('Fresh vegetables', 100000, 0)] },
    expect: { gstPaise: 0, totalPaise: 100000, documentKind: 'tax-invoice', heads: [] },
  },
  {
    name: '15 three paise at 18% round to nothing on each head',
    input: { ...intra, lines: [L('Pin', 3, 1800)] },
    expect: { cgstPaise: 0, statePaise: 0, totalPaise: 3 },
  },
  {
    name: '16 an odd basis-point rate keeps every paisa',
    input: { ...intra, lines: [L('Odd', 100000, 101)] },
    expect: { cgstPaise: 505, statePaise: 505, gstPaise: 1010, totalPaise: 101010 },
  },
  {
    name: '17 a customer whose state is unknown is treated as local',
    input: { ...intra, customerStateCode: null, lines: [L('Visit', 100000, 1800)] },
    expect: { supply: 'intra', cgstPaise: 9000, statePaise: 9000 },
    customer: { stateCode: null },
    // The arithmetic has an answer; a tax invoice still cannot go out without a place of supply.
    refused: 'missing-place-of-supply',
  },
  {
    name: '18 an old date carries the old 12% rate',
    input: { ...intra, dateIso: '2025-09-21', lines: [L('Umbrella', 100000, 1200)] },
    expect: { cgstPaise: 6000, statePaise: 6000, totalPaise: 112000 },
  },
  {
    name: '19 a blank line carries no value',
    input: { ...intra, lines: [L('Visit', 10000, 1800), L('', 20000, 1800)] },
    expect: { subtotalPaise: 10000, totalPaise: 11800 },
  },
  {
    name: '20 a crore-rupee bill',
    input: { ...intra, lines: [L('Turnkey project', 1000000000, 1800)] },
    expect: { subtotalPaise: 1000000000, cgstPaise: 90000000, statePaise: 90000000, totalPaise: 1180000000 },
    customer: { address: '4, MIDC, Nagpur', stateCode: '27' },
  },
];

const seller: IssueBusiness = {
  registration: 'regular',
  gstin: '27AAPFU0939F1ZV',
  stateCode: '27',
  turnoverPaise: 50000000,
  eInvoiceSelfDeclaredNotApplicable: true,
  legalName: 'Sharma Electricals',
  tradeName: 'Sharma Electricals',
  address: '12, Dharampeth, Nagpur',
  city: 'Nagpur',
  phone: '+919876543210',
  upi: 'sharma@upi',
};
const walkIn: IssueCustomer = { id: null, name: 'Priya', gstin: null, stateCode: '27', address: null, phone: null };

describe('twenty fixtures through the one engine (I4)', () => {
  it.each(FIXTURES)('$name', (f) => {
    const { heads, ...rest } = f.expect;
    const r = computeTax(f.input);
    expect(r).toMatchObject(rest);
    if (heads) expect(r.heads).toEqual(heads);
    // The ledger identity holds on every fixture.
    expect(r.gstPaise).toBe(r.cgstPaise + r.statePaise + r.igstPaise + r.cessPaise);
    expect(r.totalPaise).toBe(r.subtotalPaise + r.gstPaise + r.roundOffPaise);
    // Gross less discount is the taxable value, or, for a price that includes tax, the value with tax.
    const inclusive = f.input.lines.some((l) => l.priceIncludesTax);
    expect(inclusive ? r.totalBeforeRoundingPaise : r.subtotalPaise).toBe(r.grossPaise - r.discountPaise);
    expect(r.rateSummary.reduce((s, row) => s + row.taxablePaise, 0)).toBe(r.subtotalPaise);
  });

  it.each(FIXTURES)('$name: the issued snapshot and the GSTR-1 built from it carry the same figures', (f) => {
    const business: IssueBusiness = {
      ...seller,
      registration: f.input.registration,
      gstin: f.input.registration === 'regular' ? seller.gstin : null,
      stateCode: f.input.sellerStateCode,
    };
    const customer: IssueCustomer = { ...walkIn, stateCode: f.input.customerStateCode, ...f.customer };
    const result = prepareIssue(
      {
        kind: 'bill',
        dateIso: f.input.dateIso,
        gstOn: f.input.gstOn,
        roundToRupee: f.input.roundToRupee,
        placeOfSupplyStateCode: f.input.customerStateCode,
        lines: f.input.lines.map((l) => ({ ...l, taxRateChosen: true })),
      },
      business,
      customer,
      GST_RULES,
      DATE,
    );
    if (f.refused) {
      expect(result.ok).toBe(false);
      expect(!result.ok && result.blockers.map((b) => b.code)).toContain(f.refused);
      return;
    }
    expect(result.ok, JSON.stringify(result.ok ? null : result.blockers)).toBe(true);
    if (!result.ok) return;
    const direct = computeTax(f.input);
    expect(result.snapshot.totals.totalPaise).toBe(direct.totalPaise);
    expect(result.snapshot.totals.gstPaise).toBe(direct.gstPaise);
    expect(result.snapshot.rulesApplied).toEqual(expect.arrayContaining(direct.rulesApplied));
    if (result.kind !== 'tax-invoice') return;
    const period = f.input.dateIso.slice(0, 7);
    const outward = outwardDocumentsFromSnapshots([
      { id: 'doc', number: 'INV-1', status: 'issued', snapshot: result.snapshot },
    ]);
    const gstr1 = buildGstr1({ period, documents: outward });
    expect(gstr1.totals.taxablePaise).toBe(direct.subtotalPaise);
    expect(gstr1.totals.cgstPaise + gstr1.totals.statePaise + gstr1.totals.igstPaise + gstr1.totals.cessPaise).toBe(
      direct.gstPaise,
    );
  });

  // Stage 6: the bill form's running total (the MakeBar) is the same engine call as the issued bill.
  const plain = FIXTURES.filter(
    (f) =>
      !f.refused &&
      !f.input.roundToRupee &&
      f.input.lines.every((l) => !l.priceIncludesTax && !l.discountPaise && !l.cessBp && !l.unit),
  );
  it.each(plain)('$name: the form preview shows what the bill will say', (f) => {
    const rates = f.input.lines.map((l) => l.gstBp / 100);
    const preview = formPreview(
      {
        lines: f.input.lines.map((l) => ({
          what: l.description,
          qty: String(l.quantityMilli / 1000),
          rate: (l.unitPricePaise / 100).toFixed(2),
        })),
        gst: { on: f.input.gstOn, mode: 'perline', rate: rates[0] ?? 18, perLine: rates },
        customerState: f.input.customerStateCode,
        date: f.input.dateIso,
      },
      { registration: f.input.registration, stateCode: f.input.sellerStateCode },
    );
    const direct = computeTax(f.input);
    expect(preview.totalPaise).toBe(direct.totalPaise);
    expect(preview.gstPaise).toBe(direct.gstPaise);
    expect(preview.heads).toEqual(direct.heads);
  });
});
