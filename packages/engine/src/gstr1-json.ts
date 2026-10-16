import type { MonthPeriod } from './dates';
import type { Gstr1Tables } from './workings';

/**
 * GSTR-1 as the GSTN offline tool imports it (gstr1.json in the CA pack,
 * Stage 8): the JSON the "GSTR-1 Offline Utility" reads and the portal's
 * "Upload JSON" takes. Key names and shapes follow the offline tool's
 * published sample file (GSTN, GSTR-1 offline utility, "Sample JSON");
 * tests/fixtures/gstn/gstr1-sample.json is that structure, and the test
 * checks every key path here against it. Amounts in rupees (two decimals),
 * dates dd-mm-yyyy, the period as MMYYYY. Nothing is filed: the CA imports
 * the file, checks it, and files.
 */
export interface Gstr1Json {
  gstin: string;
  fp: string;
  b2b: Array<{
    ctin: string;
    inv: Array<{
      inum: string;
      idt: string;
      val: number;
      pos: string;
      rchrg: 'N' | 'Y';
      inv_typ: 'R';
      itms: Array<{ num: number; itm_det: ItemDetail }>;
    }>;
  }>;
  b2cl: Array<{
    pos: string;
    inv: Array<{ inum: string; idt: string; val: number; itms: Array<{ num: number; itm_det: ItemDetail }> }>;
  }>;
  b2cs: Array<{
    sply_ty: 'INTRA' | 'INTER';
    pos: string;
    typ: 'OE';
    rt: number;
    txval: number;
    iamt: number;
    camt: number;
    samt: number;
    csamt: number;
  }>;
  cdnr: Array<{
    ctin: string;
    nt: Array<{
      ntty: 'C';
      nt_num: string;
      nt_dt: string;
      val: number;
      pos: string;
      rchrg: 'N';
      inv_typ: 'R';
      itms: Array<{ num: number; itm_det: ItemDetail }>;
    }>;
  }>;
  /** Table 9B, unregistered: credit notes against B2C Large invoices (the rest are netted into B2CS); absent when none. */
  cdnur?: Array<{
    typ: 'B2CL';
    ntty: 'C';
    nt_num: string;
    nt_dt: string;
    val: number;
    pos: string;
    itms: Array<{ num: number; itm_det: ItemDetail }>;
  }>;
  /** Table 8: nil-rated, exempt and non-GST supplies; absent when there are none. */
  nil?: {
    inv: Array<{
      sply_ty: 'INTRB2B' | 'INTRAB2B' | 'INTRB2C' | 'INTRAB2C';
      nil_amt: number;
      expt_amt: number;
      ngsup_amt: number;
    }>;
  };
  hsn: {
    data: Array<{
      num: number;
      hsn_sc: string;
      desc: string;
      uqc: string;
      qty: number;
      rt: number;
      txval: number;
      iamt: number;
      camt: number;
      samt: number;
      csamt: number;
    }>;
  };
  doc_issue: {
    doc_det: Array<{
      doc_num: number;
      docs: Array<{ num: number; from: string; to: string; totnum: number; cancel: number; net_issue: number }>;
    }>;
  };
}
export interface ItemDetail {
  rt: number;
  txval: number;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
}

const rupees = (paise: number) => Math.round(paise) / 100;
/** 2026-09-24 → 24-09-2026. */
export const gstnDate = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
/** 2026-09 → 092026. */
export const gstnPeriod = (period: MonthPeriod) => `${period.slice(5, 7)}${period.slice(0, 4)}`;

const detail = (l: {
  gstBp: number;
  taxablePaise: number;
  igstPaise: number;
  cgstPaise: number;
  statePaise: number;
  cessPaise: number;
}) => ({
  rt: l.gstBp / 100,
  txval: rupees(l.taxablePaise),
  iamt: rupees(l.igstPaise),
  camt: rupees(l.cgstPaise),
  samt: rupees(l.statePaise),
  csamt: rupees(l.cessPaise),
});
/** The offline tool numbers an item by its rate (18 % → 1801). */
const itemNumber = (gstBp: number, i: number) => Math.round(gstBp / 100) * 100 + i + 1;

const isService = (code: string | null) => Boolean(code && code.replace(/\D/g, '').startsWith('99'));

/** Unit quantity codes the portal takes; a unit it does not know is OTH. */
const UQC: Record<string, string> = {
  nos: 'NOS',
  pcs: 'PCS',
  pc: 'PCS',
  kg: 'KGS',
  kgs: 'KGS',
  g: 'GMS',
  gm: 'GMS',
  l: 'LTR',
  ltr: 'LTR',
  m: 'MTR',
  mtr: 'MTR',
  box: 'BOX',
  set: 'SET',
  hr: 'OTH',
  job: 'OTH',
};

export function toGstr1Json(args: { gstin: string; sellerStateCode: string; tables: Gstr1Tables }): Gstr1Json {
  const t = args.tables;
  const b2b = t.b2b.map((c) => ({
    ctin: c.customerGstin,
    inv: c.documents.map((d) => ({
      inum: d.documentNumber,
      idt: gstnDate(d.documentDate),
      val: rupees(d.invoiceValuePaise),
      pos: d.placeOfSupplyStateCode ?? args.sellerStateCode,
      rchrg: 'N' as const,
      inv_typ: 'R' as const,
      itms: d.lines.map((l, i) => ({ num: itemNumber(l.gstBp, i), itm_det: detail(l) })),
    })),
  }));
  const b2clByPos = new Map<string, Gstr1Json['b2cl'][number]>();
  for (const d of t.b2cLarge) {
    const pos = d.placeOfSupplyStateCode ?? args.sellerStateCode;
    const bucket = b2clByPos.get(pos) ?? { pos, inv: [] };
    bucket.inv.push({
      inum: d.documentNumber,
      idt: gstnDate(d.documentDate),
      val: rupees(d.invoiceValuePaise),
      itms: d.lines.map((l, i) => ({ num: itemNumber(l.gstBp, i), itm_det: detail(l) })),
    });
    b2clByPos.set(pos, bucket);
  }
  // B2C (small) by place of supply and rate; a credit note to an unregistered customer is netted here.
  const b2cs = new Map<string, Gstr1Json['b2cs'][number]>();
  const addB2cs = (
    pos: string,
    gstBp: number,
    sign: number,
    h: { taxablePaise: number; igstPaise: number; cgstPaise: number; statePaise: number; cessPaise: number },
  ) => {
    const key = `${pos}|${gstBp}`;
    const row = b2cs.get(key) ?? {
      sply_ty: pos === args.sellerStateCode ? ('INTRA' as const) : ('INTER' as const),
      pos,
      typ: 'OE' as const,
      rt: gstBp / 100,
      txval: 0,
      iamt: 0,
      camt: 0,
      samt: 0,
      csamt: 0,
    };
    row.txval = rupees(Math.round(row.txval * 100) + sign * h.taxablePaise);
    row.iamt = rupees(Math.round(row.iamt * 100) + sign * h.igstPaise);
    row.camt = rupees(Math.round(row.camt * 100) + sign * h.cgstPaise);
    row.samt = rupees(Math.round(row.samt * 100) + sign * h.statePaise);
    row.csamt = rupees(Math.round(row.csamt * 100) + sign * h.cessPaise);
    b2cs.set(key, row);
  };
  for (const r of t.b2cSmall) addB2cs(r.placeOfSupplyStateCode ?? args.sellerStateCode, r.gstBp, 1, r);

  // Credit notes: to a registered customer in CDNR (one note, its rates as items); to the rest, netted in B2CS.
  const cdnr = new Map<string, Gstr1Json['cdnr'][number]>();
  const cdnur: NonNullable<Gstr1Json['cdnur']> = [];
  const byNote = new Map<string, Gstr1Tables['creditNotes']>();
  for (const n of t.creditNotes) byNote.set(n.documentNumber, [...(byNote.get(n.documentNumber) ?? []), n]);
  for (const [number, parts] of byNote) {
    const first = parts[0]!;
    if (first.registered && first.customerGstin) {
      const bucket = cdnr.get(first.customerGstin) ?? { ctin: first.customerGstin, nt: [] };
      const value = parts.reduce(
        (s, p) => s + p.taxablePaise + p.cgstPaise + p.statePaise + p.igstPaise + p.cessPaise,
        0,
      );
      bucket.nt.push({
        ntty: 'C',
        nt_num: number,
        nt_dt: gstnDate(first.documentDate),
        val: rupees(value),
        pos: first.placeOfSupplyStateCode ?? args.sellerStateCode,
        rchrg: 'N',
        inv_typ: 'R',
        itms: parts.map((p, i) => ({
          num: i + 1,
          itm_det: detail(p),
        })),
      });
      cdnr.set(first.customerGstin, bucket);
    } else if (first.unregisteredType === 'B2CL') {
      cdnur.push({
        typ: 'B2CL',
        ntty: 'C',
        nt_num: number,
        nt_dt: gstnDate(first.documentDate),
        val: rupees(
          parts.reduce((s, p) => s + p.taxablePaise + p.cgstPaise + p.statePaise + p.igstPaise + p.cessPaise, 0),
        ),
        pos: first.placeOfSupplyStateCode ?? args.sellerStateCode,
        itms: parts.map((p, i) => ({ num: i + 1, itm_det: detail(p) })),
      });
    } else {
      for (const p of parts) addB2cs(p.placeOfSupplyStateCode ?? args.sellerStateCode, p.gstBp, -1, p);
    }
  }

  const hsn = t.hsnSummary.map((h, i) => ({
    num: i + 1,
    hsn_sc: h.hsnCode ?? '',
    desc: h.description.slice(0, 30),
    // A service (SAC, chapter 99) has no unit quantity: the portal takes NA and 0.
    uqc: isService(h.hsnCode) ? 'NA' : (UQC[(h.unit ?? 'nos').toLowerCase()] ?? 'OTH'),
    qty: isService(h.hsnCode) ? 0 : h.quantityMilli / 1000,
    rt: h.gstBp / 100,
    txval: rupees(h.taxablePaise),
    iamt: rupees(h.igstPaise),
    camt: rupees(h.cgstPaise),
    samt: rupees(h.statePaise),
    csamt: rupees(h.cessPaise),
  }));
  // Table 13 by GSTN document type: 1, invoices for outward supply; 5, credit notes. One row per series in each.
  const docDet = (
    [
      ['invoice', 1],
      ['credit-note', 5],
    ] as const
  )
    .map(([type, docNum]) => ({
      doc_num: docNum,
      docs: t.documentSummary
        .filter((d) => d.docType === type)
        .map((d, i) => ({
          num: i + 1,
          from: d.from,
          to: d.to,
          totnum: d.total + d.cancelled,
          cancel: d.cancelled,
          net_issue: d.total,
        })),
    }))
    .filter((d) => d.docs.length);
  return {
    gstin: args.gstin,
    fp: gstnPeriod(t.period),
    b2b,
    b2cl: [...b2clByPos.values()],
    b2cs: [...b2cs.values()],
    cdnr: [...cdnr.values()],
    ...(cdnur.length ? { cdnur } : {}),
    ...(t.nilExempt.length
      ? {
          nil: {
            inv: t.nilExempt.map((r) => ({
              sply_ty: r.supplyType,
              nil_amt: rupees(r.nilPaise),
              expt_amt: 0,
              ngsup_amt: 0,
            })),
          },
        }
      : {}),
    hsn: { data: hsn },
    doc_issue: { doc_det: docDet },
  };
}
