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
