import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { IssueLine } from '../../packages/engine/src/index';
import * as documents from '../../packages/db/src/repos/documents';
import * as gst from '../../packages/db/src/repos/gst';
import { browserPath, closeRenderer } from '../../packages/render/src/index';
import { buildCaPack } from '../../packages/render/src/ca-pack';
import { readXlsx } from '../../apps/worker/src/import/xlsx';
import { scopeFor, seeded } from './helpers';

/**
 * Stage 8: a quarter's workings from issued documents, hand-computed below;
 * every figure drills down to documents that sum to it; gstr1.json has the
 * GSTN offline tool's structure; workings.xlsx reads back to the workings.
 *
 * The quarter Apr–Jun 2026 of Sharma Electricals (no seeded bill falls in it):
 *   A  Mehta Traders (B2B, 27): ₹10,000 at 18 % + ₹2,000 at 5 %   → CGST 900+50, SGST 900+50, total ₹13,900
 *   B  walk-in in Madhya Pradesh (B2C, inter-State): ₹1,000 at 12 % → IGST 120, total ₹1,120
 *   C  walk-in in Maharashtra (B2C, intra): ₹500 at 18 %          → CGST 45, SGST 45, total ₹590
 *   D  Mehta Traders ₹3,000 at 18 %, cancelled                    → reported, never counted
 *   CN against A: ₹1,180 including 18 %                          → taxable 1,000, CGST 90, SGST 90
 * Net: taxable 10,000+2,000+1,000+500−1,000 = ₹12,500; CGST 950+45−90 = ₹905; SGST ₹905; IGST ₹120.
 * By rate: 18 % taxable 9,500 (CGST 855, SGST 855); 12 % taxable 1,000 (IGST 120); 5 % taxable 2,000 (CGST 50, SGST 50).
 */
const MEHTA = { name: 'Mehta Traders', gstin: '27AABCG1234H1ZZ', stateCode: '27' };
const line = (description: string, pricePaise: number, gstBp: number, extra: Partial<IssueLine> = {}): IssueLine => ({
  description,
  quantityMilli: 1000,
  unitPricePaise: pricePaise,
  gstBp,
  taxRateChosen: true,
  hsnCode: '9987',
  ...extra,
});
const Q = ['2026-04', '2026-05', '2026-06'];
let ids: Record<'A' | 'B' | 'C' | 'D' | 'CN', string>;
let numbers: Record<'A' | 'B' | 'C' | 'D' | 'CN', string>;

seeded();
beforeAll(async () => {
  const owner = await scopeFor('sharma', 'owner');
  // The figures below are hand-computed for this quarter alone: another test file that issues a Sharma document
  // dated in it would change them, depending on the order vitest runs the files in. Say so plainly.
  const before = await gst.workingsFor(owner, Q);
  if (before.documents.length)
    throw new Error(
      `gst.test.ts needs Sharma's ${Q[0]}..${Q[2]} to itself; already there: ${before.documents.map((d) => d.number).join(', ')}`,
    );
  const issue = async (date: string, customer: documents.DraftCustomer, lines: IssueLine[]) => {
    const d = await documents.createDraft(owner, { customer, dateIso: date, lines });
    return documents.issueDocument(owner, { id: d.id, today: date });
  };
  // Fresh each run: the test database is dropped and migrated per run (global setup).
  const A = await issue('2026-04-10', MEHTA, [line('Panel wiring', 1000000, 1800), line('Fuse set', 200000, 500)]);
  const B = await issue('2026-05-05', { name: 'Bhopal walk-in', stateCode: '23' }, [
    line('Inverter service', 100000, 1200),
  ]);
  const C = await issue('2026-05-20', { name: 'Counter sale', stateCode: '27' }, [line('Switch', 50000, 1800)]);
  const D = await issue('2026-06-02', MEHTA, [line('Wrong bill', 300000, 1800)]);
  await documents.cancelDocument(owner, { id: D.id, reason: 'Wrong customer' });
  const note = await documents.createCreditNote(owner, {
    invoiceId: A.id,
    dateIso: '2026-06-15',
    reason: 'Part returned',
    lines: [line('Part returned', 118000, 1800, { priceIncludesTax: true })],
  });
  const CN = await documents.issueDocument(owner, { id: note.id, today: '2026-06-15' });
  ids = { A: A.id, B: B.id, C: C.id, D: D.id, CN: CN.id };
  numbers = { A: A.number!, B: B.number!, C: C.number!, D: D.number!, CN: CN.number! };
});
afterAll(() => closeRenderer());

describe('the workings of a quarter (hand-computed above)', () => {
  it('nets the credit note, leaves out the cancelled bill, and splits by rate', async () => {
    const w = await gst.workingsFor(await scopeFor('sharma', 'accountant'), Q);
    expect(w.gstr1.totals).toEqual({
      taxablePaise: 1250000,
      cgstPaise: 90500,
      statePaise: 90500,
      igstPaise: 12000,
      cessPaise: 0,
    });
    expect(w.byRate.map((r) => [r.gstBp, r.taxablePaise, r.cgstPaise, r.statePaise, r.igstPaise])).toEqual([
      [500, 200000, 5000, 5000, 0],
      [1200, 100000, 0, 0, 12000],
      [1800, 950000, 85500, 85500, 0],
    ]);
    // B2B: Mehta's bill A with both rates; the cancelled D is not there.
    expect(w.gstr1.b2b).toHaveLength(1);
    expect(w.gstr1.b2b[0]!.documents.map((d) => [d.documentNumber, d.invoiceValuePaise])).toEqual([
      [numbers.A, 1390000],
    ]);
    // B2C small: the inter-State and the intra-State walk-ins, by place of supply and rate.
    expect(w.gstr1.b2cSmall.map((r) => [r.placeOfSupplyStateCode, r.gstBp, r.taxablePaise]).sort()).toEqual([
      ['23', 1200, 100000],
      ['27', 1800, 50000],
    ]);
    // The credit note to a registered customer, and the documents summary counting the cancelled bill.
    expect(w.gstr1.creditNotes.map((n) => [n.documentNumber, n.registered, n.taxablePaise, n.cgstPaise])).toEqual([
      [numbers.CN, true, 100000, 9000],
    ]);
    expect(w.gstr1.documentSummary).toEqual([{ from: numbers.A, to: numbers.C, total: 3, cancelled: 1 }]);
    // GSTR-3B 3.1(a) and 3.2.
    expect(w.gstr3b.taxable.taxablePaise).toBe(1250000);
    expect(w.gstr3b.interStateUnregistered).toEqual([
      { placeOfSupplyStateCode: '23', taxablePaise: 100000, igstPaise: 12000 },
    ]);
  });

  it('every rate row drills down to documents that add up to it', async () => {
    const w = await gst.workingsFor(await scopeFor('sharma', 'owner'), Q);
    for (const row of w.byRate) {
      const parts = w.outward.filter(
        (o) => o.gstBp === row.gstBp && row.sourceDocumentIds.includes(o.sourceDocumentId),
      );
      const sum = (k: 'taxablePaise' | 'cgstPaise' | 'statePaise' | 'igstPaise') =>
        parts.reduce((s, o) => s + (o.documentType === 'credit-note' ? -1 : 1) * o[k], 0);
      expect([sum('taxablePaise'), sum('cgstPaise'), sum('statePaise'), sum('igstPaise')]).toEqual([
        row.taxablePaise,
        row.cgstPaise,
        row.statePaise,
        row.igstPaise,
      ]);
    }
    // And the B2B, B2C and credit-note tables to their documents.
    const docIds = (rows: Array<{ sourceDocumentId?: string; sourceDocumentIds?: string[] }>) =>
      rows.flatMap((r) => r.sourceDocumentIds ?? [r.sourceDocumentId!]);
    expect(docIds(w.gstr1.b2b.flatMap((c) => c.documents))).toEqual([ids.A]);
    expect(new Set(docIds(w.gstr1.b2cSmall))).toEqual(new Set([ids.B, ids.C]));
    expect(docIds(w.gstr1.creditNotes)).toEqual([ids.CN]);
    expect(w.documents.find((d) => d.id === ids.D)?.status).toBe('cancelled');
  });
});

describe('gstr1.json and workings.xlsx (the CA pack)', () => {
  /** Every key path of `ours` (arrays collapsed) must exist in the sample with the same JSON type. */
  function paths(v: unknown, prefix = ''): Array<[string, string]> {
    if (Array.isArray(v)) return v.length ? paths(v[0], `${prefix}[]`) : [[`${prefix}[]`, 'array']];
    if (v && typeof v === 'object')
      return Object.entries(v as Record<string, unknown>)
        .filter(([k]) => !k.startsWith('_'))
        .flatMap(([k, x]) => paths(x, prefix ? `${prefix}.${k}` : k));
    return [[prefix, typeof v]];
  }

  it.skipIf(!browserPath())(
    'one zip: workings.xlsx that reads back, gstr1.json in the GSTN structure, every PDF',
    { timeout: 60_000 },
    async () => {
      const pack = await buildCaPack(await scopeFor('sharma', 'owner'), Q);
      const files = unzipSync(pack.zip);
      expect(Object.keys(files).sort()).toEqual(
        ['README.txt', 'gstr1.json', 'workings.xlsx', ...Object.values(numbers).map((n) => `bills/${n}.pdf`)].sort(),
      );
      for (const n of Object.values(numbers))
        expect(Buffer.from(files[`bills/${n}.pdf`]!.subarray(0, 5)).toString()).toBe('%PDF-');

      // gstr1.json: the figures, and the offline tool's structure.
      const json = JSON.parse(Buffer.from(files['gstr1.json']!).toString());
      expect(json).toMatchObject({ gstin: '27AAAAA0000A1Z2', fp: '062026' });
      expect(json.b2b[0].inv[0]).toMatchObject({ inum: numbers.A, idt: '10-04-2026', val: 13900, pos: '27' });
      expect(
        json.b2b[0].inv[0].itms.map((i: { num: number; itm_det: { rt: number; txval: number } }) => [
          i.num,
          i.itm_det.rt,
          i.itm_det.txval,
        ]),
      ).toEqual([
        [501, 5, 2000],
        [1802, 18, 10000],
      ]);
      expect(json.cdnr[0].nt[0]).toMatchObject({ ntty: 'C', nt_num: numbers.CN, nt_dt: '15-06-2026', val: 1180 });
      expect(json.b2cs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ sply_ty: 'INTER', pos: '23', rt: 12, txval: 1000, iamt: 120 }),
          expect.objectContaining({ sply_ty: 'INTRA', pos: '27', rt: 18, txval: 500, camt: 45, samt: 45 }),
        ]),
      );
      expect(json.doc_issue.doc_det[0].docs[0]).toMatchObject({ totnum: 4, cancel: 1, net_issue: 3 });
      const sample = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'gstn', 'gstr1-sample.json'), 'utf8'));
      const allowed = new Map(paths(sample));
      for (const [path, type] of paths(json)) {
        // An empty table is fine where the sample has that table.
        if (type === 'array' && [...allowed.keys()].some((k) => k.startsWith(path))) continue;
        expect(allowed.has(path), `${path} is not in the GSTN sample`).toBe(true);
        expect(`${path}:${type}`).toBe(`${path}:${allowed.get(path)}`);
      }

      // workings.xlsx: the Summary and B2B sheets read back to the workings.
      const xlsx = files['workings.xlsx']!;
      const summary = readXlsx(xlsx, 1);
      const value = (label: string) => summary.find((r) => r[0] === label)?.[1];
      expect(value('GSTIN')).toBe('27AAAAA0000A1Z2');
      expect(Number(value('Taxable value (net of credit notes)'))).toBe(12500);
      expect(Number(value('CGST'))).toBe(905);
      expect(Number(value('IGST'))).toBe(120);
      expect(Number(value('Documents cancelled'))).toBe(1);
      const b2b = readXlsx(xlsx, 2);
      expect(b2b[0]).toEqual(expect.arrayContaining(['Customer GSTIN', 'Invoice', 'Rate %', 'Taxable']));
      expect(b2b.slice(1).map((r) => [r[2], Number(r[6]), Number(r[7])])).toEqual([
        [numbers.A, 5, 2000],
        [numbers.A, 18, 10000],
      ]);
      const docs = readXlsx(xlsx, 8);
      expect(
        docs
          .slice(1)
          .map((r) => r[3])
          .sort(),
      ).toEqual(['cancelled', 'issued', 'issued', 'issued', 'issued']);
    },
  );
});
