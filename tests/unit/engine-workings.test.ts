import { describe, expect, it } from 'vitest';

import {
  buildGstr1,
  buildGstr3bOutward,
  excludeIffFurnished,
  hsnRowLabel,
  nextFilingPeriod,
  obligationsFor,
  outwardDocumentsFromSnapshots,
  qrmpPlan,
  type OutwardDocument,
} from '../../packages/engine/src/workings';
import { prepareIssue } from '../../packages/engine/src/issue';

/** Salvaged from the MVP's tests/unit/gst-returns.test.ts (GSTR-1 tables, 3B outward) and qrmp.test.ts (tag mvp-final). */
function outward(over: Partial<OutwardDocument> = {}): OutwardDocument {
  return {
    id: 'out-1',
    sourceDocumentId: 'doc-1',
    documentNumber: 'INV-001',
    documentDate: '2026-09-15',
    documentType: 'invoice',
    customerGstin: null,
    customerName: 'Walk-in customer',
    placeOfSupplyStateCode: '27',
    isInterState: false,
    invoiceValuePaise: 236000,
    gstBp: 1800,
    taxablePaise: 200000,
    cgstPaise: 18000,
    statePaise: 18000,
    igstPaise: 0,
    cessPaise: 0,
    hsnLines: [],
    ...over,
  };
}

describe('GSTR-1 tables', () => {
  it('splits B2B from B2C and totals each', () => {
    const t = buildGstr1({
      period: '2026-09',
      documents: [
        outward({
          id: 'a',
          documentNumber: 'INV-001',
          customerGstin: '29AAGCB7383J1Z4',
          customerName: 'Registered Buyer',
        }),
        outward({ id: 'b', documentNumber: 'INV-002', customerGstin: null }),
      ],
    });
    expect(t.b2b).toHaveLength(1);
    expect(t.b2b[0]!.customerGstin).toBe('29AAGCB7383J1Z4');
    expect(t.b2cSmall).toHaveLength(1);
    expect(t.totals.taxablePaise).toBe(400000);
  });
  it('summarises B2C by place of supply and rate', () => {
    const t = buildGstr1({
      period: '2026-09',
      documents: [
        outward({ id: 'a', gstBp: 1800, taxablePaise: 100000 }),
        outward({ id: 'b', gstBp: 1800, taxablePaise: 50000 }),
        outward({ id: 'c', gstBp: 500, taxablePaise: 20000 }),
      ],
    });
    expect(t.b2cSmall).toHaveLength(2);
    expect(t.b2cSmall.find((s) => s.gstBp === 1800)!.taxablePaise).toBe(150000);
  });
  it('reports an inter-State B2C bill above the pack’s threshold document by document (B2CL; gstr1-b2c-large-2024)', () => {
    const big = outward({
      id: 'big',
      documentNumber: 'INV-009',
      isInterState: true,
      placeOfSupplyStateCode: '23',
      invoiceValuePaise: 15000000,
      taxablePaise: 12711864,
      cgstPaise: 0,
      statePaise: 0,
      igstPaise: 2288136,
    });
    const small = outward({
      id: 'small',
      documentNumber: 'INV-010',
      isInterState: true,
      placeOfSupplyStateCode: '23',
      invoiceValuePaise: 50000,
      taxablePaise: 42373,
      cgstPaise: 0,
      statePaise: 0,
      igstPaise: 7627,
    });
    const t = buildGstr1({ period: '2026-09', documents: [big, small] });
    expect(t.b2cLarge.map((d) => d.documentNumber)).toEqual(['INV-009']);
    expect(t.b2cSmall).toHaveLength(1);
    expect(t.ruleIds).toContain('gstr1-b2c-large-2024');
    // Before 1 November 2024 the line was ₹2,50,000: the same bill dated then is small.
    const old = buildGstr1({ period: '2024-09', documents: [{ ...big, documentDate: '2024-09-15' }] });
    expect(old.b2cLarge).toHaveLength(0);
    expect(old.ruleIds).toContain('gstr1-b2c-large-2017');
  });
  it('subtracts a credit note rather than counting it as a sale, and lists it as CDNR or CDNUR', () => {
    const t = buildGstr1({
      period: '2026-09',
      documents: [
        outward({ id: 'a', taxablePaise: 200000, cgstPaise: 18000, statePaise: 18000 }),
        outward({ id: 'b', documentType: 'credit-note', taxablePaise: 50000, cgstPaise: 4500, statePaise: 4500 }),
      ],
    });
    expect(t.totals.taxablePaise).toBe(150000);
    expect(t.creditNotes).toHaveLength(1);
    expect(t.creditNotes[0]!.registered).toBe(false);
  });
  it('keeps every figure traceable to its source documents', () => {
    const t = buildGstr1({ period: '2026-09', documents: [outward({ id: 'src-1' })] });
    expect(t.b2cSmall[0]!.sourceIds).toContain('src-1');
  });
  it('carries the bill behind every B2B document', () => {
    const t = buildGstr1({
      period: '2026-09',
      documents: [
        outward({ id: 'a', documentNumber: 'INV-001', customerGstin: '29AAGCB7383J1Z4', sourceDocumentId: 'doc-a' }),
      ],
    });
    expect(t.b2b[0]!.documents[0]!.sourceDocumentId).toBe('doc-a');
  });
  it('carries the bills behind a B2C summary row and counts them', () => {
    const t = buildGstr1({
      period: '2026-09',
      documents: [
        outward({ id: 'a', gstBp: 1800, sourceDocumentId: 'doc-a' }),
        outward({ id: 'b', gstBp: 1800, sourceDocumentId: 'doc-b' }),
      ],
    });
    const row = t.b2cSmall.find((s) => s.gstBp === 1800)!;
    expect(row.documentCount).toBe(2);
    expect(row.sourceDocumentIds).toEqual(['doc-a', 'doc-b']);
  });
  it('lists a bill once even when it lands in the row twice', () => {
    const t = buildGstr1({
      period: '2026-09',
      documents: [
        outward({ id: 'a__1800', sourceDocumentId: 'doc-a' }),
        outward({ id: 'a__1800-again', sourceDocumentId: 'doc-a' }),
      ],
    });
    expect(t.b2cSmall[0]!.sourceDocumentIds).toEqual(['doc-a']);
  });
  it('does not name a mixed HSN group after one of its items', () => {
    const line = (description: string, quantityMilli: number, taxablePaise: number) => ({
      hsnCode: null,
      description,
      quantityMilli,
      unit: null,
      taxablePaise,
      gstBp: 1800,
      cgstPaise: 0,
      statePaise: 0,
      igstPaise: 0,
      cessPaise: 0,
    });
    const t = buildGstr1({
      period: '2026-09',
      documents: [
        outward({ id: 'b', documentNumber: 'INV-002', hsnLines: [line('Paint tins', 2000, 145000)] }),
        outward({ id: 'a', documentNumber: 'INV-001', hsnLines: [line('Cement bags', 4000, 152000)] }),
      ],
    });
    expect(t.hsnSummary).toHaveLength(1);
    const row = t.hsnSummary[0]!;
    expect(row.quantityMilli).toBe(6000);
    expect(row.descriptions).toEqual(['Cement bags', 'Paint tins']);
    expect(hsnRowLabel(row)).toBe('Cement bags and Paint tins');
  });
  it('says how many item names a capped HSN row is hiding', () => {
    expect(
      hsnRowLabel({ description: 'Cement bags', descriptions: ['Cement bags', 'Paint tins'], descriptionCount: 9 }),
    ).toBe('Cement bags, Paint tins and 7 more');
  });
  it('leaves a single-item HSN row named after its item', () => {
    expect(hsnRowLabel({ description: 'Cement bags', descriptions: ['Cement bags'], descriptionCount: 1 })).toBe(
      'Cement bags',
    );
  });
  it('orders the tables by document, not by whatever order it was handed', () => {
    const docs = [
      outward({ id: 'c', documentNumber: 'INV-003', documentDate: '2026-09-20', sourceDocumentId: 'doc-c' }),
      outward({ id: 'a', documentNumber: 'INV-001', documentDate: '2026-09-02', sourceDocumentId: 'doc-a' }),
      outward({ id: 'b', documentNumber: 'INV-002', documentDate: '2026-09-11', sourceDocumentId: 'doc-b' }),
    ];
    const forwards = buildGstr1({ period: '2026-09', documents: docs });
    const backwards = buildGstr1({ period: '2026-09', documents: [...docs].reverse() });
    expect(forwards.b2cSmall[0]!.sourceDocumentIds).toEqual(['doc-a', 'doc-b', 'doc-c']);
    expect(backwards).toEqual(forwards);
  });
  it('reports cancelled documents without counting them as sales, and keeps a period to its months', () => {
    const t = buildGstr1({
      period: '2026-09',
      documents: [
        outward({ documentNumber: 'INV-001' }),
        outward({ id: 'x', documentNumber: 'INV-050', documentDate: '2026-10-01' }),
      ],
      cancelledNumbers: ['INV-002'],
    });
    expect(t.documentSummary[0]!.cancelled).toBe(1);
    expect(t.documentSummary[0]!.total).toBe(1);
    expect(t.totals.taxablePaise).toBe(200000);
    const quarter = buildGstr1({
      period: '2026-09',
      periods: ['2026-07', '2026-08', '2026-09'],
      documents: [outward({ documentDate: '2026-07-04' }), outward({ id: 'y', documentDate: '2026-09-30' })],
    });
    expect(quarter.totals.taxablePaise).toBe(400000);
  });
});

describe('GSTR-3B outward (3.1 and 3.2)', () => {
  it('totals taxable supplies, keeps nil-rated apart, and lists inter-State B2C by state; credit notes net off', () => {
    const w = buildGstr3bOutward({
      period: '2026-09',
      documents: [
        outward({ id: 'a' }),
        outward({ id: 'n', gstBp: 0, taxablePaise: 50000, cgstPaise: 0, statePaise: 0 }),
        outward({
          id: 'i',
          isInterState: true,
          placeOfSupplyStateCode: '23',
          taxablePaise: 100000,
          cgstPaise: 0,
          statePaise: 0,
          igstPaise: 18000,
        }),
        outward({ id: 'c', documentType: 'credit-note', taxablePaise: 20000, cgstPaise: 1800, statePaise: 1800 }),
      ],
    });
    expect(w.taxable).toEqual({
      taxablePaise: 280000,
      cgstPaise: 16200,
      statePaise: 16200,
      igstPaise: 18000,
      cessPaise: 0,
    });
    expect(w.nilRatedPaise).toBe(50000);
    expect(w.interStateUnregistered).toEqual([
      { placeOfSupplyStateCode: '23', taxablePaise: 100000, igstPaise: 18000 },
    ]);
  });
});

describe('from issued snapshots (I2: workings read the snapshot, never the live record)', () => {
  it('turns a snapshot into one outward document per rate', () => {
    const r = prepareIssue(
      {
        kind: 'bill',
        dateIso: '2026-09-24',
        gstOn: true,
        placeOfSupplyStateCode: '27',
        lines: [
          { description: 'AMC', quantityMilli: 1000, unitPricePaise: 350000, gstBp: 1800, taxRateChosen: true },
          { description: 'Rice', quantityMilli: 1000, unitPricePaise: 10000, gstBp: 500, taxRateChosen: true },
        ],
      },
      {
        registration: 'regular',
        gstin: '27AAAAA0000A1Z2',
        stateCode: '27',
        turnoverPaise: 5000000000,
        eInvoiceSelfDeclaredNotApplicable: true,
        legalName: 'Sharma Electricals',
        tradeName: 'Sharma Electricals',
        address: '12, Dharampeth',
        city: 'Nagpur',
        phone: null,
        upi: null,
      },
      {
        id: 'mehta',
        name: 'Mehta Traders',
        gstin: '27AAPFU0939F1ZV',
        stateCode: '27',
        address: 'Sitabuldi',
        phone: null,
      },
      undefined,
      '2026-10-15',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const docs = outwardDocumentsFromSnapshots([
      { id: 'd1', number: 'INV-045', status: 'issued', snapshot: r.snapshot },
      { id: 'd2', number: 'INV-046', status: 'cancelled', snapshot: r.snapshot },
    ]);
    expect(docs.map((d) => [d.id, d.gstBp, d.taxablePaise, d.cgstPaise])).toEqual([
      ['d1__1800', 1800, 350000, 31500],
      ['d1__500', 500, 10000, 250],
    ]);
    const t = buildGstr1({ period: '2026-09', documents: docs });
    expect(t.b2b[0]!.documents[0]!.invoiceValuePaise).toBe(r.totals.totalPaise);
  });
});

describe('QRMP quarters', () => {
  it('groups months into financial-year quarters', () => {
    expect(qrmpPlan('2026-09', false).months).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(qrmpPlan('2026-07', false).quarterPeriod).toBe('2026-09');
    expect(qrmpPlan('2026-02', false).months).toEqual(['2026-01', '2026-02', '2026-03']);
  });
  it('offers IFF only in the first two months, and only when used', () => {
    expect(qrmpPlan('2026-09', true).iffMonths).toEqual(['2026-07', '2026-08']);
    expect(qrmpPlan('2026-09', false).iffMonths).toEqual([]);
  });
  it('keeps a monthly payment obligation in the first two months', () => {
    expect(qrmpPlan('2026-09', false).monthlyPaymentMonths).toEqual(['2026-07', '2026-08']);
  });
});

describe('what is owed in a month', () => {
  it('gives a monthly filer both returns every month', () => {
    const o = obligationsFor('2026-09', 'monthly', false);
    expect(o.forms.map((f) => f.form)).toEqual(['GSTR-1', 'GSTR-3B']);
    expect(o.paymentOnlyMonth).toBe(false);
  });
  it('gives a quarterly filer both returns only at the quarter end', () => {
    const o = obligationsFor('2026-09', 'quarterly-qrmp', false);
    expect(o.forms.map((f) => f.form)).toEqual(['GSTR-1', 'GSTR-3B']);
    expect(o.forms[0]!.coversPeriods).toEqual(['2026-07', '2026-08', '2026-09']);
  });
  it('marks the first two months of a quarter as payment-only', () => {
    const july = obligationsFor('2026-07', 'quarterly-qrmp', false);
    expect(july.forms).toHaveLength(0);
    expect(july.paymentOnlyMonth).toBe(true);
  });
  it('adds IFF to those months when the taxpayer uses it', () => {
    const july = obligationsFor('2026-07', 'quarterly-qrmp', true);
    expect(july.forms.map((f) => f.form)).toEqual(['IFF']);
    expect(july.paymentOnlyMonth).toBe(true);
  });
  it('advances by one month or one quarter as appropriate', () => {
    expect(nextFilingPeriod('2026-09', 'monthly')).toBe('2026-10');
    expect(nextFilingPeriod('2026-09', 'quarterly-qrmp')).toBe('2026-12');
  });
});

describe('IFF de-duplication', () => {
  const docs = [
    { documentNumber: 'INV-001', documentDate: '2026-07-10' },
    { documentNumber: 'INV-002', documentDate: '2026-07-22' },
    { documentNumber: 'INV-003', documentDate: '2026-08-05' },
    { documentNumber: 'INV-004', documentDate: '2026-09-15' },
  ];
  it('excludes documents already furnished through IFF', () => {
    const { included, excluded } = excludeIffFurnished(docs, [
      { period: '2026-07', documentNumbers: ['INV-001', 'INV-002'] },
      { period: '2026-08', documentNumbers: ['INV-003'] },
    ]);
    expect(excluded.map((d) => d.documentNumber)).toEqual(['INV-001', 'INV-002', 'INV-003']);
    expect(included.map((d) => d.documentNumber)).toEqual(['INV-004']);
  });
  it('keeps a document whose number was furnished in a different month', () => {
    const { included } = excludeIffFurnished(docs, [{ period: '2026-08', documentNumbers: ['INV-001'] }]);
    expect(included.map((d) => d.documentNumber)).toContain('INV-001');
  });
});
