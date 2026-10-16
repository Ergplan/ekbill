import { gst } from '@ekbill/db';
import {
  financialYearOf,
  addMonthsToPeriod,
  computeTax,
  formatPeriodLong,
  gstQuarterOf,
  isMonthPeriod,
  monthPeriodOf,
  type MonthPeriod,
  type OutwardDocument,
} from '@ekbill/engine';

import { FIXTURE } from '../fixtures';
import { billsOf, customerOf } from '../common';
import { scopeOf, todayOf } from '../live';
import type { Viewer } from '../viewer';

export interface GstData {
  period: { label: string; mode: 'month' | 'quarter' };
  bills: number;
  taxablePaise: number;
  gstPaise: number;
  byRate: Array<{ rate: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number }>;
  b2b: Array<{ number: string; fy?: string; name: string; gstin: string; totalPaise: number; gstPaise: number }>;
  b2cBills: number;
  /** The real period (Stage 8): its months, the chips to other periods, the drill-down links. */
  live: {
    from: MonthPeriod;
    to: MonthPeriod;
    anchor: MonthPeriod;
    periods: Array<{ key: MonthPeriod; label: string }>;
  } | null;
}

/**
 * The quarter's workings, computed by the engine over the period's bills
 * (I4): the fixture carries only the period label. Cancelled bills are
 * left out; a bill without a tax-invoice kind contributes no tax.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export async function loadGst(
  viewer: Viewer,
  opts: { period?: string | null; q?: string | null } = {},
): Promise<GstData | null> {
  const b = viewer.business;
  if (!b || b.registration !== 'regular') return null;
  const scope = scopeOf(viewer);
  if (scope) return loadLiveGst(viewer, opts);
  const quarter = FIXTURE.gstQuarter;
  // "Mahina": the quarter's last month; "Quarter": the fixture's quarter. Stage 8 offers every period with bills.
  const month = {
    label: `${MONTHS[Number(quarter.to.slice(5, 7)) - 1]} ${quarter.to.slice(0, 4)}`,
    from: `${quarter.to.slice(0, 8)}01`,
    to: quarter.to,
  };
  const q = opts.period === 'month' ? { ...month, mode: 'month' as const } : { ...quarter, mode: 'quarter' as const };
  const bills = billsOf(b)
    .filter((x) => x.status !== 'cancelled' && x.date >= q.from && x.date <= q.to)
    .map((bill) => {
      const customer = customerOf(b, bill.customer);
      const tax = computeTax({
        lines: bill.lines.map((l) => ({
          description: l.what,
          quantityMilli: Math.round(l.qty * 1000),
          unitPricePaise: l.ratePaise,
          gstBp: (l.gstRate ?? 0) * 100,
        })),
        registration: b.registration,
        gstOn: bill.kind === 'tax-invoice',
        dateIso: bill.date,
        sellerStateCode: b.stateCode,
        customerStateCode: customer?.stateCode ?? null,
      });
      return { bill, customer, tax };
    });
  const byRate = new Map<number, GstData['byRate'][number]>();
  for (const { tax } of bills) {
    for (const l of tax.lines) {
      if (l.blank || !l.gstBp) continue;
      const rate = l.gstBp / 100;
      const row = byRate.get(rate) ?? { rate, taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 };
      row.taxablePaise += l.taxablePaise;
      row.cgstPaise += l.cgstPaise;
      row.sgstPaise += l.statePaise;
      row.igstPaise += l.igstPaise;
      byRate.set(rate, row);
    }
  }
  const b2b = bills
    .filter((p) => p.customer?.gstin)
    .map((p) => ({
      number: p.bill.number,
      name: p.customer!.name,
      gstin: p.customer!.gstin!,
      totalPaise: p.tax.totalPaise,
      gstPaise: p.tax.gstPaise,
    }));
  return {
    period: { label: q.label, mode: q.mode },
    bills: bills.length,
    taxablePaise: bills.reduce((a, p) => a + p.tax.subtotalPaise, 0),
    gstPaise: bills.reduce((a, p) => a + p.tax.gstPaise, 0),
    byRate: [...byRate.values()].sort((a, b) => a.rate - b.rate),
    b2b,
    b2cBills: bills.length - b2b.length,
    live: null,
  };
}

/** The months a view covers: the anchor month, or its GST quarter. */
export function monthsOf(anchor: MonthPeriod, mode: 'month' | 'quarter'): MonthPeriod[] {
  return mode === 'month' ? [anchor] : gstQuarterOf(anchor).months;
}

/** A session's GST tab (Stage 8): the engine's workings over the issued bills of the period. */
async function loadLiveGst(viewer: Viewer, opts: { period?: string | null; q?: string | null }): Promise<GstData> {
  const scope = scopeOf(viewer)!;
  const mode = opts.period === 'month' ? 'month' : 'quarter';
  const withBills = await gst.monthsWithBills(scope);
  const anchor = opts.q && isMonthPeriod(opts.q) ? opts.q : (withBills[0] ?? monthPeriodOf(todayOf(viewer)));
  const months = monthsOf(anchor, mode);
  const w = await gst.workingsFor(scope, months);
  const t = w.gstr1;
  const invoices = w.documents.filter((d) => d.status === 'issued' && d.kind === 'tax_invoice');
  const tax = (h: { cgstPaise: number; statePaise: number; igstPaise: number; cessPaise: number }) =>
    h.cgstPaise + h.statePaise + h.igstPaise + h.cessPaise;
  const seen = new Set<string>();
  const periods: Array<{ key: MonthPeriod; label: string }> = [];
  for (const m of withBills) {
    const key = mode === 'month' ? m : gstQuarterOf(m).months[0]!;
    if (seen.has(key)) continue;
    seen.add(key);
    periods.push({ key, label: mode === 'month' ? formatPeriodLong(m) : gstQuarterOf(m).label });
    if (periods.length >= 6) break;
  }
  return {
    period: { label: mode === 'month' ? formatPeriodLong(anchor) : gstQuarterOf(anchor).label, mode },
    bills: invoices.length,
    taxablePaise: t.totals.taxablePaise,
    gstPaise: tax(t.totals),
    byRate: w.byRate.map((r) => ({
      rate: r.gstBp / 100,
      taxablePaise: r.taxablePaise,
      cgstPaise: r.cgstPaise,
      sgstPaise: r.statePaise,
      igstPaise: r.igstPaise,
    })),
    b2b: t.b2b.flatMap((c) =>
      c.documents.map((d) => ({
        number: d.documentNumber,
        fy: financialYearOf(d.documentDate),
        name: c.customerName,
        gstin: c.customerGstin,
        totalPaise: d.invoiceValuePaise,
        gstPaise: d.lines.reduce((s, l) => s + tax(l), 0),
      })),
    ),
    b2cBills: invoices.filter((d) => !d.customerGstin).length,
    live: { from: months[0]!, to: months.at(-1)!, anchor: months[0]!, periods },
  };
}

export type DrillTable = 'rate' | 'b2b' | 'b2c' | 'cdn' | 'all';
export interface DrillData {
  title: string;
  from: MonthPeriod;
  to: MonthPeriod;
  rows: Array<{
    number: string;
    fy?: string;
    date: string;
    name: string;
    taxablePaise: number;
    taxPaise: number;
    credit: boolean;
  }>;
  taxablePaise: number;
  taxPaise: number;
}

/** The documents behind one figure of the GST tab; their sum is the figure (the drill-down rule). */
export async function loadGstDrill(
  viewer: Viewer,
  opts: { from: string | null; to: string | null; table: string | null; rate: string | null },
): Promise<DrillData | null> {
  const scope = scopeOf(viewer);
  const b = viewer.business;
  if (!scope || !b || b.registration !== 'regular') return null;
  if (!opts.from || !opts.to || !isMonthPeriod(opts.from) || !isMonthPeriod(opts.to) || opts.to < opts.from)
    return null;
  const months: MonthPeriod[] = [];
  for (let m: MonthPeriod = opts.from; m <= opts.to && months.length < 12; m = addMonthsToPeriod(m, 1)) months.push(m);
  const w = await gst.workingsFor(scope, months);
  const table = (['rate', 'b2b', 'b2c', 'cdn'].includes(opts.table ?? '') ? opts.table : 'all') as DrillTable;
  const rate = opts.rate ? Number(opts.rate) : null;
  const byDoc = new Map<string, OutwardDocument[]>();
  for (const o of w.outward) byDoc.set(o.sourceDocumentId, [...(byDoc.get(o.sourceDocumentId) ?? []), o]);
  const keep = (o: OutwardDocument) => {
    if (table === 'rate') return o.gstBp === rate;
    // B2B and B2C are the taxed parts (Tables 4 to 7); a 0 % part is Table 8's.
    if (table === 'b2b') return o.documentType === 'invoice' && o.gstBp > 0 && Boolean(o.customerGstin);
    if (table === 'b2c') return o.documentType === 'invoice' && o.gstBp > 0 && !o.customerGstin;
    if (table === 'cdn') return o.documentType === 'credit-note';
    return true;
  };
  const rows: DrillData['rows'] = [];
  for (const [, parts] of byDoc) {
    const mine = parts.filter(keep);
    if (!mine.length) continue;
    const sign = mine[0]!.documentType === 'credit-note' ? -1 : 1;
    rows.push({
      number: mine[0]!.documentNumber,
      fy: financialYearOf(mine[0]!.documentDate),
      date: mine[0]!.documentDate,
      name: mine[0]!.customerName,
      taxablePaise: sign * mine.reduce((s, o) => s + o.taxablePaise, 0),
      taxPaise: sign * mine.reduce((s, o) => s + o.cgstPaise + o.statePaise + o.igstPaise + o.cessPaise, 0),
      credit: sign < 0,
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number, 'en', { numeric: true }));
  const titles: Record<DrillTable, string> = {
    rate: `${(rate ?? 0) / 100}%`,
    b2b: 'B2B',
    b2c: 'B2C',
    cdn: 'Credit notes',
    all: 'All',
  };
  return {
    title: titles[table],
    from: opts.from,
    to: opts.to,
    rows,
    taxablePaise: rows.reduce((s, r) => s + r.taxablePaise, 0),
    taxPaise: rows.reduce((s, r) => s + r.taxPaise, 0),
  };
}
