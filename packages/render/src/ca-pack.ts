import { strToU8, zipSync } from 'fflate';

import { businesses, gst, type TenantScope } from '@ekbill/db';
import { financialYearOf, formatPeriodLong, toGstr1Json, type MonthPeriod, type Gstr1Json } from '@ekbill/engine';

import { printAndKeep } from './print';
import { writeXlsx, type Cell, type Sheet } from './xlsx';

/**
 * "CA ko bhejo" (Stage 8): one zip for the accountant. workings.xlsx (the
 * GSTR-1 tables, GSTR-3B 3.1 and 3.2, every document of the period),
 * gstr1.json in the GSTN offline tool's format, and every bill and credit
 * note of the period as its PDF. Everything from the issued snapshots and
 * the engine; nothing here files anything.
 */
const r = (paise: number) => Math.round(paise) / 100;
const pct = (bp: number) => bp / 100;

export interface CaPack {
  zip: Uint8Array;
  name: string;
  documents: number;
  gstr1: Gstr1Json;
  sheets: Sheet[];
}

export async function buildCaPack(scope: TenantScope, months: MonthPeriod[]): Promise<CaPack> {
  const sorted = [...months].sort();
  const [profile, w] = await Promise.all([businesses.getProfile(scope), gst.workingsFor(scope, sorted)]);
  const label =
    sorted.length === 1
      ? formatPeriodLong(sorted[0]!)
      : `${formatPeriodLong(sorted[0]!)} to ${formatPeriodLong(sorted.at(-1)!)}`;
  const t = w.gstr1;
  const summary: Cell[][] = [
    ['EkBill GST workings', ''],
    ['Business', profile.legalName],
    ['GSTIN', profile.gstin ?? ''],
    ['Period', label],
    ['Documents issued', w.documents.filter((d) => d.status === 'issued').length],
    ['Documents cancelled', w.documents.filter((d) => d.status === 'cancelled').length],
    ['Taxable value (net of credit notes)', r(t.totals.taxablePaise)],
    ['CGST', r(t.totals.cgstPaise)],
    ['SGST/UTGST', r(t.totals.statePaise)],
    ['IGST', r(t.totals.igstPaise)],
    ['Cess', r(t.totals.cessPaise)],
    ['Note', 'Computed by EkBill from the issued bills. Nothing has been filed. Check, then file from your own login.'],
  ];
  const b2b: Cell[][] = [
    [
      'Customer GSTIN',
      'Customer',
      'Invoice',
      'Date',
      'Place of supply',
      'Invoice value',
      'Rate %',
      'Taxable',
      'IGST',
      'CGST',
      'SGST',
      'Cess',
    ],
  ];
  for (const c of t.b2b)
    for (const d of c.documents)
      for (const l of d.lines)
        b2b.push([
          c.customerGstin,
          c.customerName,
          d.documentNumber,
          d.documentDate,
          d.placeOfSupplyStateCode ?? '',
          r(d.invoiceValuePaise),
          pct(l.gstBp),
          r(l.taxablePaise),
          r(l.igstPaise),
          r(l.cgstPaise),
          r(l.statePaise),
          r(l.cessPaise),
        ]);
  const b2cl: Cell[][] = [['Invoice', 'Date', 'Place of supply', 'Invoice value', 'Rate %', 'Taxable', 'IGST', 'Cess']];
  for (const d of t.b2cLarge)
    for (const l of d.lines)
      b2cl.push([
        d.documentNumber,
        d.documentDate,
        d.placeOfSupplyStateCode ?? '',
        r(d.invoiceValuePaise),
        pct(l.gstBp),
        r(l.taxablePaise),
        r(l.igstPaise),
        r(l.cessPaise),
      ]);
  const b2cs: Cell[][] = [['Place of supply', 'Rate %', 'Documents', 'Taxable', 'IGST', 'CGST', 'SGST', 'Cess']];
  for (const row of t.b2cSmall)
    b2cs.push([
      row.placeOfSupplyStateCode ?? '',
      pct(row.gstBp),
      row.documentCount,
      r(row.taxablePaise),
      r(row.igstPaise),
      r(row.cgstPaise),
      r(row.statePaise),
      r(row.cessPaise),
    ]);
  const cdn: Cell[][] = [
    ['Credit note', 'Date', 'Customer GSTIN', 'Registered', 'Taxable', 'IGST', 'CGST', 'SGST', 'Cess'],
  ];
  for (const n of t.creditNotes)
    cdn.push([
      n.documentNumber,
      n.documentDate,
      n.customerGstin ?? '',
      n.registered ? 'yes' : 'no',
      r(n.taxablePaise),
      r(n.igstPaise),
      r(n.cgstPaise),
      r(n.statePaise),
      r(n.cessPaise),
    ]);
  const hsn: Cell[][] = [
    ['HSN/SAC', 'Description', 'Unit', 'Quantity', 'Rate %', 'Taxable', 'IGST', 'CGST', 'SGST', 'Cess'],
  ];
  for (const h of t.hsnSummary)
    hsn.push([
      h.hsnCode ?? '',
      h.description,
      h.unit ?? '',
      h.quantityMilli / 1000,
      pct(h.gstBp),
      r(h.taxablePaise),
      r(h.igstPaise),
      r(h.cgstPaise),
      r(h.statePaise),
      r(h.cessPaise),
    ]);
  const g3b = w.gstr3b;
  const gstr3b: Cell[][] = [
    ['GSTR-3B', 'Taxable', 'IGST', 'CGST', 'SGST', 'Cess'],
    [
      '3.1(a) Outward taxable supplies',
      r(g3b.taxable.taxablePaise),
      r(g3b.taxable.igstPaise),
      r(g3b.taxable.cgstPaise),
      r(g3b.taxable.statePaise),
      r(g3b.taxable.cessPaise),
    ],
    ['3.1(c) Nil rated and exempt', r(g3b.nilRatedPaise), 0, 0, 0, 0],
    ...g3b.interStateUnregistered.map((s): Cell[] => [
      `3.2 Unregistered, place of supply ${s.placeOfSupplyStateCode ?? ''}`,
      r(s.taxablePaise),
      r(s.igstPaise),
      null,
      null,
      null,
    ]),
  ];
  const docs: Cell[][] = [['Number', 'Date', 'Kind', 'Status', 'Customer', 'Customer GSTIN', 'Total']];
  for (const d of w.documents)
    docs.push([
      d.number,
      d.issueDate,
      d.kind.replace('_', ' '),
      d.status,
      d.customerName,
      d.customerGstin ?? '',
      r(d.totalPaise),
    ]);
  const sheets: Sheet[] = [
    { name: 'Summary', rows: summary },
    { name: 'B2B (4A)', rows: b2b },
    { name: 'B2C Large (5)', rows: b2cl },
    { name: 'B2C Small (7)', rows: b2cs },
    { name: 'Credit notes (9B)', rows: cdn },
    { name: 'HSN (12)', rows: hsn },
    { name: 'GSTR-3B', rows: gstr3b },
    { name: 'Documents', rows: docs },
  ];
  const gstr1 = toGstr1Json({ gstin: profile.gstin ?? '', sellerStateCode: profile.stateCode ?? '', tables: t });
  const files: Record<string, Uint8Array> = {
    'README.txt': strToU8(
      [
        `${profile.legalName} (${profile.gstin ?? 'no GSTIN'}) — GST workings for ${label}.`,
        '',
        'workings.xlsx  GSTR-1 tables (4A, 5, 7, 9B, 12, 13), GSTR-3B 3.1 and 3.2, and every document.',
        'gstr1.json     GSTR-1 in the GSTN offline tool format: import it into the offline tool, check, upload.',
        'bills/         every bill and credit note of the period as issued (PDF).',
        '',
        'Prepared by EkBill from the issued bills. Nothing has been filed.',
      ].join('\n'),
    ),
    'workings.xlsx': writeXlsx(sheets),
    'gstr1.json': strToU8(`${JSON.stringify(gstr1, null, 2)}\n`),
  };
  for (const d of w.documents) {
    const pdf = await printAndKeep(scope, { documentId: d.id, kind: 'pdf', paper: 'a4' });
    // One file per document: a pack across 1 April can hold last year's INV-001 and this year's, and INV/001 and
    // INV-001 make the same file name; the second takes its year (and, if that is not enough, its id) on the end.
    const base = `bills/${d.number.replace(/[^A-Za-z0-9._-]+/g, '-')}`;
    const name = [`${base}.pdf`, `${base}_${financialYearOf(d.issueDate)}.pdf`, `${base}_${d.id.slice(0, 8)}.pdf`].find(
      (n) => !(n in files),
    )!;
    files[name] = new Uint8Array(pdf.bytes);
  }
  const name = `GST-${(profile.gstin ?? 'business').slice(0, 15)}-${sorted[0]}${sorted.length > 1 ? `-to-${sorted.at(-1)}` : ''}.zip`;
  return { zip: zipSync(files, { level: 6 }), name, documents: w.documents.length, gstr1, sheets };
}
