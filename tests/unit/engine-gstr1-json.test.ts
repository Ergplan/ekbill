import { describe, expect, it } from 'vitest';

import { toGstr1Json } from '../../packages/engine/src/gstr1-json';
import { buildGstr1, type OutwardDocument } from '../../packages/engine/src/workings';

/**
 * Stage 11 review: credit notes were put in gstr1.json at the seller's own state, so an inter-State note (IGST)
 * read as intra-State: in CDNR its pos was the seller's, and an unregistered buyer's note was netted into the
 * seller's state in B2CS (INTRA, with IGST). Their own place of supply now decides.
 */
const row = (
  o: Partial<OutwardDocument> & Pick<OutwardDocument, 'documentNumber' | 'documentType'>,
): OutwardDocument => ({
  id: `${o.documentNumber}__1800`,
  sourceDocumentId: o.documentNumber,
  documentDate: '2026-10-10',
  customerGstin: null,
  customerName: 'Customer',
  placeOfSupplyStateCode: '27',
  isInterState: false,
  invoiceValuePaise: 11800,
  gstBp: 1800,
  taxablePaise: 10000,
  cgstPaise: 0,
  statePaise: 0,
  igstPaise: 0,
  cessPaise: 0,
  hsnLines: [],
  ...o,
});

describe('gstr1.json: credit notes at their own place of supply', () => {
  const docs: OutwardDocument[] = [
    // To a registered customer in Madhya Pradesh: invoice and its note, IGST.
    row({
      documentNumber: 'INV-001',
      documentType: 'invoice',
      customerGstin: '23AABCG1234H1ZZ',
      placeOfSupplyStateCode: '23',
      isInterState: true,
      igstPaise: 1800,
    }),
    row({
      documentNumber: 'CN-001',
      documentType: 'credit-note',
      customerGstin: '23AABCG1234H1ZZ',
      placeOfSupplyStateCode: '23',
      isInterState: true,
      invoiceValuePaise: 1180,
      taxablePaise: 1000,
      igstPaise: 180,
    }),
    // To an unregistered buyer in Karnataka: B2C small, then a note that nets against it.
    row({
      documentNumber: 'INV-002',
      documentType: 'invoice',
      placeOfSupplyStateCode: '29',
      isInterState: true,
      igstPaise: 1800,
    }),
    row({
      documentNumber: 'CN-002',
      documentType: 'credit-note',
      placeOfSupplyStateCode: '29',
      isInterState: true,
      invoiceValuePaise: 1180,
      taxablePaise: 1000,
      igstPaise: 180,
    }),
  ];
  const json = toGstr1Json({
    gstin: '27AAAAA0000A1Z2',
    sellerStateCode: '27',
    tables: buildGstr1({ period: '2026-10', documents: docs }),
  });

  it("a registered customer's note carries the invoice's place of supply", () => {
    expect(json.cdnr[0]!.nt[0]).toMatchObject({ nt_num: 'CN-001', pos: '23' });
  });

  it("an unregistered buyer's note nets against the same state's B2CS row, inter-State", () => {
    expect(json.b2cs).toEqual([expect.objectContaining({ pos: '29', sply_ty: 'INTER', txval: 90, iamt: 16.2 })]);
  });
});

// Stage 11 review: Table 13 merged every series into one range (AMC-…/006 to INV-…/041) and left credit notes out.
describe('Table 13, the documents issued', () => {
  const docs: OutwardDocument[] = [
    row({ documentNumber: 'INV-2026-27/040', documentType: 'invoice' }),
    row({ documentNumber: 'INV-2026-27/041', documentType: 'invoice' }),
    row({ documentNumber: 'AMC-2026-27/006', documentType: 'invoice' }),
    row({ documentNumber: 'CN-2026-27/003', documentType: 'credit-note', invoiceValuePaise: 1180, taxablePaise: 1000 }),
  ];
  const tables = buildGstr1({ period: '2026-10', documents: docs, cancelledNumbers: ['INV-2026-27/042'] });

  it('one range per series, the cancelled number inside its range, credit notes apart', () => {
    expect(tables.documentSummary).toEqual([
      { docType: 'invoice', from: 'AMC-2026-27/006', to: 'AMC-2026-27/006', total: 1, cancelled: 0 },
      { docType: 'invoice', from: 'INV-2026-27/040', to: 'INV-2026-27/042', total: 2, cancelled: 1 },
      { docType: 'credit-note', from: 'CN-2026-27/003', to: 'CN-2026-27/003', total: 1, cancelled: 0 },
    ]);
  });

  it('in gstr1.json as document types 1 and 5', () => {
    const json = toGstr1Json({ gstin: '27AAAAA0000A1Z2', sellerStateCode: '27', tables });
    expect(json.doc_issue.doc_det.map((d) => [d.doc_num, d.docs.length])).toEqual([
      [1, 2],
      [5, 1],
    ]);
    expect(json.doc_issue.doc_det[0]!.docs[1]).toEqual({
      num: 2,
      from: 'INV-2026-27/040',
      to: 'INV-2026-27/042',
      totnum: 3,
      cancel: 1,
      net_issue: 2,
    });
  });
});

describe('the HSN summary (Table 12): services, and credit notes that correct a value', () => {
  const hsnLine = (hsnCode: string, unit: string | null, quantityMilli: number, taxablePaise: number) => ({
    hsnCode,
    description: hsnCode === '998719' ? 'AMC visit' : 'Ceiling fan',
    quantityMilli,
    unit,
    taxablePaise,
    gstBp: 1800,
    cgstPaise: taxablePaise * 0.09,
    statePaise: taxablePaise * 0.09,
    igstPaise: 0,
    cessPaise: 0,
  });
  const tables = buildGstr1({
    period: '2026-10',
    documents: [
      row({
        documentNumber: 'INV-010',
        documentType: 'invoice',
        hsnLines: [hsnLine('998719', 'visit', 3000, 300000), hsnLine('8414', 'nos', 2000, 200000)],
      }),
      row({
        documentNumber: 'CN-010',
        documentType: 'credit-note',
        hsnLines: [hsnLine('998719', 'visit', 1000, 100000), hsnLine('8414', 'nos', 1000, 50000)],
      }),
    ],
  });
  const json = toGstr1Json({ gstin: '27AAAAA0000A1Z2', sellerStateCode: '27', tables });
  const byCode = (code: string) => json.hsn.data.find((h) => h.hsn_sc === code)!;

  it('reports a service (SAC 99…) with the unit NA and no quantity', () => {
    expect(byCode('998719')).toMatchObject({ uqc: 'NA', qty: 0, txval: 2000 });
  });
  it('nets a credit note’s value, and leaves the quantity sold as it was', () => {
    expect(byCode('8414')).toMatchObject({ uqc: 'NOS', qty: 2, txval: 1500 });
    expect(tables.hsnSummary.find((h) => h.hsnCode === '8414')!.quantityMilli).toBe(2000);
  });
});

describe('CDNUR: a credit note against a B2C Large invoice (fourth review)', () => {
  const inter = { placeOfSupplyStateCode: '23', isInterState: true };
  const docs: OutwardDocument[] = [
    // ₹1,50,000 to an unregistered buyer in Madhya Pradesh: B2C Large; its note goes to CDNUR as B2CL.
    row({
      ...inter,
      documentNumber: 'INV-020',
      documentType: 'invoice',
      invoiceValuePaise: 15000000,
      taxablePaise: 12711864,
      igstPaise: 2288136,
    }),
    row({
      ...inter,
      documentNumber: 'CN-020',
      documentType: 'credit-note',
      invoiceValuePaise: 1180000,
      taxablePaise: 1000000,
      igstPaise: 180000,
      linkedInvoice: { number: 'INV-020', dateIso: '2026-10-10', valuePaise: 15000000 },
    }),
    // ₹11,800 inter-State: B2C small; its note is netted in B2CS.
    row({ ...inter, documentNumber: 'INV-021', documentType: 'invoice', invoiceValuePaise: 11800, igstPaise: 1800 }),
    row({
      ...inter,
      documentNumber: 'CN-021',
      documentType: 'credit-note',
      invoiceValuePaise: 1180,
      taxablePaise: 1000,
      igstPaise: 180,
      linkedInvoice: { number: 'INV-021', dateIso: '2026-10-10', valuePaise: 11800 },
    }),
  ];
  const tables = buildGstr1({ period: '2026-10', documents: docs });
  const json = toGstr1Json({ gstin: '27AAAAA0000A1Z2', sellerStateCode: '27', tables });

  it('marks the note against the large invoice B2CL, and names the invoice', () => {
    const note = tables.creditNotes.find((n) => n.documentNumber === 'CN-020')!;
    expect(note.unregisteredType).toBe('B2CL');
    expect(note.linkedNumber).toBe('INV-020');
    expect(tables.creditNotes.find((n) => n.documentNumber === 'CN-021')!.unregisteredType).toBeNull();
  });
  it('reports it in cdnur, and nets only the small one in B2CS', () => {
    expect(json.cdnur).toEqual([
      {
        typ: 'B2CL',
        ntty: 'C',
        nt_num: 'CN-020',
        nt_dt: '10-10-2026',
        val: 11800,
        pos: '23',
        itms: [{ num: 1, itm_det: { rt: 18, txval: 10000, iamt: 1800, camt: 0, samt: 0, csamt: 0 } }],
      },
    ]);
    expect(json.b2cs).toEqual([
      { sply_ty: 'INTER', pos: '23', typ: 'OE', rt: 18, txval: 90, iamt: 16.2, camt: 0, samt: 0, csamt: 0 },
    ]);
  });
});

describe('a credit note’s rate in gstr1.json is the rate it was issued at (Stage 8 review)', () => {
  // 7 paise at 18 % within the State: CGST and SGST 1 paisa each. Worked back from the heads that read as 28.6 %.
  const tiny = (o: Partial<OutwardDocument>) =>
    row({
      documentNumber: 'CN-030',
      documentType: 'credit-note',
      invoiceValuePaise: 9,
      taxablePaise: 7,
      cgstPaise: 1,
      statePaise: 1,
      ...o,
    });
  it('CDNR carries 18, not a rate guessed from a paisa of tax', () => {
    const tables = buildGstr1({ period: '2026-10', documents: [tiny({ customerGstin: '27AABCG1234H1ZZ' })] });
    const json = toGstr1Json({ gstin: '27AAAAA0000A1Z2', sellerStateCode: '27', tables });
    expect(json.cdnr[0]!.nt[0]!.itms[0]!.itm_det.rt).toBe(18);
  });
  it('an unregistered note nets into the 18 % B2CS row', () => {
    const tables = buildGstr1({
      period: '2026-10',
      documents: [row({ documentNumber: 'INV-030', documentType: 'invoice' }), tiny({})],
    });
    const json = toGstr1Json({ gstin: '27AAAAA0000A1Z2', sellerStateCode: '27', tables });
    expect(json.b2cs.map((r) => r.rt)).toEqual([18]);
  });
});

describe('two documents under one number are two documents in GSTR-1 (Stage 3 review)', () => {
  it('B2B lists both, each with its own value', () => {
    const g = '27AABCG1234H1ZZ';
    const t = buildGstr1({
      period: '2026-10',
      documents: [
        row({
          documentNumber: 'INV-001',
          documentType: 'invoice',
          customerGstin: g,
          sourceDocumentId: 'a',
          invoiceValuePaise: 11800,
        }),
        row({
          documentNumber: 'INV-001',
          documentType: 'invoice',
          customerGstin: g,
          sourceDocumentId: 'b',
          id: 'b__1800',
          invoiceValuePaise: 23600,
          taxablePaise: 20000,
        }),
      ],
    });
    expect(t.b2b[0]!.documents.map((d) => d.invoiceValuePaise).sort()).toEqual([11800, 23600]);
  });
});
