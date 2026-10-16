import { customers as customerRepo, documents, items as itemRepo, series as seriesRepo } from '@ekbill/db';
import { findState, previewNumber, type AssessBusiness, type RecentBill } from '@ekbill/engine';

import { FIXTURE, TODAY, type Business } from '../fixtures';
import { billOf, billsOf, customerOf, customersOf } from '../common';
import { ledgerOf, linesOf, scopeOf, todayOf } from '../live';
import { avatarIndex, customerIdOf } from '../people';
import type { Viewer } from '../viewer';
import type { BillDraft } from './compute';
import { gstOfLines } from './gst-lines';

export interface BillFormData {
  business: {
    name: string;
    registration: Business['registration'];
    stateCode: string | null;
    stateName: string | null;
    defaultRate: number;
    upi: string | null;
    gstin: string | null;
    address: string | null;
  };
  customer: {
    id: string;
    name: string;
    stateCode: string | null;
    stateName: string | null;
    gstin: string | null;
    /** The address on record (address, city), for the ₹50,000 B2C check the issue makes. */
    address: string | null;
  } | null;
  /** The previous bill for this customer, for "Pichle jaisa hi?" */
  previous: {
    month: string;
    lines: Array<{ what: string; qty: string; rate: string }>;
    totalPaise: number;
    gstRate: number | null;
    /** Each line's rate, when the lines' rates differ (else empty): the form fills them per line. */
    gstRates: number[];
  } | null;
  /** The draft the form opens with (number from the series, today's date). */
  initial: BillDraft;
  /** Item suggestions for "Kya kiya?" */
  items: Array<{ name: string; rate: string; gstRate: number | null; hsn?: string | null }>;
  /** For the picker (bill-start): customers by recency. */
  pick: Array<{ id: string; name: string; index: number }>;
  mode: 'existing' | 'new-customer' | 'first';
  /** The bill this one replaces (cancel-and-redo: its lines start the draft), else null. */
  redo: string | null;
  /** Stage 6: the form issues for real (a session); null for a look at the fixtures. */
  live: {
    seriesId: string | null;
    today: string;
    /** The business's bills of the last fortnight, for the duplicate guard (engine findDuplicate). */
    recent: RecentBill[];
    /** The customer's last bill's lines, for the rate-oddity guard (engine rateOddities). */
    lastLines: Array<{ description: string; unitPricePaise: number }>;
    /** The cancelled-and-redone bill's id. */
    redoId: string | null;
    /** The seller as assess() sees it: the form runs the issue's checks as the owner types (Stage 8). */
    seller: AssessBusiness;
  } | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type BillFormOpts = {
  customer: string | null;
  first: boolean;
  newCustomer: boolean;
  state: string | null;
  name?: string | null;
  redo?: string | null;
};

export async function loadBillForm(viewer: Viewer, opts: BillFormOpts): Promise<BillFormData> {
  return scopeOf(viewer) && viewer.business ? loadLiveForm(viewer, opts) : loadFixtureForm(viewer, opts);
}

const toLine = (l: { what: string; qty: number; ratePaise: number }) => ({
  what: l.what,
  qty: String(l.qty),
  rate: String(l.ratePaise / 100),
});

/** The form for a session (Stage 6): the customer row, their last bill, the default series, the items. */
async function loadLiveForm(viewer: Viewer, opts: BillFormOpts): Promise<BillFormData> {
  const scope = scopeOf(viewer)!;
  const b = viewer.business!;
  const loaded = viewer.loaded!;
  const today = todayOf(viewer);
  const registration = b.registration;
  const defaultRate = b.gstDefaultRate ?? 18;
  const bills = loaded.series.filter((x) => x.kind === 'bill' && x.active);
  const series = bills.find((x) => x.id === loaded.profile.defaultSeriesId) ?? bills[0] ?? null;
  const number = series ? previewNumber(seriesRepo.configOf(series), today) : '';
  const id = opts.customer ? customerIdOf(b.id, opts.customer) : null;
  const row = id ? await customerRepo.getCustomer(scope, id).catch(() => null) : null;
  const previousDoc = row ? await documents.lastBillFor(scope, row.id) : null;
  const previousLines = previousDoc ? linesOf(previousDoc) : [];
  const previous = previousDoc
    ? {
        month: MONTHS[Number(previousDoc.issueDate.slice(5, 7)) - 1] ?? '',
        lines: previousLines.map(toLine),
        totalPaise: previousDoc.totals?.totalPaise ?? 0,
        gstRate: previousLines[0]?.gstRate ?? null,
        gstRates: gstOfLines(
          previousLines.map((l) => l.gstRate),
          defaultRate,
        ).perLine,
      }
    : null;
  const customerState = opts.state === 'check-fail' ? null : (row?.stateCode ?? null);
  const mode = opts.first ? 'first' : opts.newCustomer || !row ? 'new-customer' : 'existing';
  const redoId = opts.redo ? await documents.findBill(scope, opts.redo) : null;
  const redoDoc = redoId ? await documents.getDocument(scope, redoId) : null;
  // The form needs the last fortnight (the duplicate guard) and who was billed when (Stage 10: not the whole book).
  const since = new Date(Date.parse(`${todayOf(viewer)}T00:00:00Z`) - 15 * 86_400_000).toISOString().slice(0, 10);
  const ledger = await ledgerOf(viewer, { since });
  const last = new Map<string, string>();
  for (const x of ledger.bills) if (x.customer && !last.has(x.customer)) last.set(x.customer, x.date);
  const people = await customerRepo.listCustomers(scope);
  for (const c of people) if (!last.has(c.id) && c.lastBilledAt) last.set(c.id, c.lastBilledAt);
  const pick = [...people].sort((x, y) => (last.get(y.id) ?? '').localeCompare(last.get(x.id) ?? ''));
  const [itemRows, seller] = await Promise.all([itemRepo.listItems(scope), documents.sellerNow(scope)]);
  const fortnight = ledger.bills
    .map((x, i) => ({ x, r: ledger.rows[i]! }))
    .filter(({ r }) => r.days <= 14)
    .map(({ x, r }) => ({
      id: x.id,
      number: x.number,
      status: x.status === 'cancelled' ? ('cancelled' as const) : ('issued' as const),
      issueDate: x.date,
      customerId: x.customer || null,
      customerName: r.name,
      totalPaise: x.totalPaise,
    }));
  const redoLines = redoDoc ? linesOf(redoDoc) : null;
  return {
    business: {
      name: b.name,
      registration,
      stateCode: b.stateCode,
      stateName: b.stateName,
      defaultRate,
      upi: b.upi,
      gstin: b.gstin,
      address: [b.address, b.city].filter(Boolean).join(', ') || null,
    },
    customer: row
      ? {
          id: row.id,
          name: row.name,
          stateCode: customerState,
          stateName: customerState ? (findState(customerState)?.name ?? null) : null,
          gstin: row.gstin,
          address: [row.address, row.city].filter(Boolean).join(', ') || null,
        }
      : null,
    previous,
    initial: {
      customer: row?.id ?? null,
      customerName: row?.name ?? opts.name?.trim() ?? '',
      customerState,
      lines: redoLines?.length ? redoLines.map(toLine) : [{ what: '', qty: '1', rate: '' }],
      gst: {
        on: registration === 'regular' && (redoDoc ? redoDoc.gstOn : true),
        ...(redoLines?.length
          ? gstOfLines(
              redoLines.map((l) => l.gstRate),
              defaultRate,
            )
          : { mode: 'one' as const, rate: previous?.gstRate ?? defaultRate, perLine: [] }),
      },
      series: series?.prefix.replace(/[-/]+$/, '') ?? '',
      number,
      date: today,
    },
    items: itemRows.map((i) => ({
      name: i.name,
      rate: i.defaultRatePaise === null ? '' : String(i.defaultRatePaise / 100),
      gstRate: i.defaultTaxBp === null ? null : i.defaultTaxBp / 100,
      hsn: i.hsnSac,
    })),
    pick: pick.map((c) => ({ id: c.id, name: c.name, index: avatarIndex(c.id) })),
    mode,
    redo: redoDoc?.number ?? null,
    live: {
      seriesId: series?.id ?? null,
      today,
      recent: fortnight,
      lastLines: previousDoc
        ? previousDoc.lines.map((l) => ({ description: l.description, unitPricePaise: l.unitPricePaise }))
        : [],
      redoId,
      seller: {
        registration: seller.registration,
        gstin: seller.gstin,
        stateCode: seller.stateCode,
        turnoverPaise: seller.turnoverPaise,
        eInvoiceSelfDeclaredNotApplicable: seller.eInvoiceSelfDeclaredNotApplicable,
        eInvoiceExemption: seller.eInvoiceExemption ?? null,
      },
    },
  };
}

function loadFixtureForm(
  viewer: Viewer,
  opts: {
    customer: string | null;
    first: boolean;
    newCustomer: boolean;
    state: string | null;
    name?: string | null;
    redo?: string | null;
  },
): BillFormData {
  const b = viewer.business;
  const registration = b?.registration ?? 'unregistered';
  const defaultRate = b?.gstDefaultRate ?? 18;
  const series = b?.series[0] ?? { prefix: registration === 'composition' ? 'BOS' : 'INV', next: 1 };
  const number = `${series.prefix}-${String(series.next).padStart(3, '0')}`;
  const customer = b && opts.customer ? customerOf(b, opts.customer) : null;
  const previousBill =
    b && customer ? billsOf(b).find((x) => x.customer === customer.id && x.status !== 'cancelled') : null;
  const previous = previousBill
    ? {
        month: MONTHS[Number(previousBill.date.slice(5, 7)) - 1] ?? '',
        lines: previousBill.lines.map((l) => ({ what: l.what, qty: String(l.qty), rate: String(l.ratePaise / 100) })),
        totalPaise: previousBill.totalPaise,
        gstRate: previousBill.lines[0]?.gstRate ?? null,
        gstRates: gstOfLines(
          previousBill.lines.map((l) => l.gstRate),
          defaultRate,
        ).perLine,
      }
    : null;
  // The fixture's failing check: a customer without a state on a regular business.
  const customerState = opts.state === 'check-fail' ? null : (customer?.stateCode ?? null);
  const mode = opts.first ? 'first' : opts.newCustomer || !customer ? 'new-customer' : 'existing';
  const bills = b ? billsOf(b) : [];
  const last = new Map<string, string>();
  for (const x of bills) if (!last.has(x.customer)) last.set(x.customer, x.date);
  // Cancel-and-redo: the bill being replaced (the cancellation is the same tap, so its status may still be due here).
  const redoBill = b && opts.redo ? billOf(b, opts.redo) : null;
  const pick = b ? [...customersOf(b)].sort((x, y) => (last.get(y.id) ?? '').localeCompare(last.get(x.id) ?? '')) : [];
  return {
    business: {
      name: b?.name ?? '',
      registration,
      stateCode: b?.stateCode ?? null,
      stateName: b?.stateName ?? null,
      defaultRate,
      upi: b?.upi ?? null,
      gstin: b?.gstin ?? null,
      address: b ? `${b.address ?? ''}, ${b.city ?? ''}` : null,
    },
    customer: customer
      ? {
          id: customer.id,
          name: customer.name,
          stateCode: customerState,
          stateName: customerState ? customer.stateName : null,
          gstin: customer.gstin,
          address: null,
        }
      : null,
    previous,
    initial: {
      customer: customer?.id ?? null,
      customerName: customer?.name ?? opts.name?.trim() ?? '',
      customerState,
      lines: redoBill
        ? redoBill.lines.map((l) => ({ what: l.what, qty: String(l.qty), rate: String(l.ratePaise / 100) }))
        : [{ what: '', qty: '1', rate: '' }],
      gst: {
        on: registration === 'regular',
        ...(redoBill?.lines.length
          ? gstOfLines(
              redoBill.lines.map((l) => l.gstRate),
              defaultRate,
            )
          : { mode: 'one' as const, rate: previous?.gstRate ?? defaultRate, perLine: [] }),
      },
      series: series.prefix,
      number,
      date: TODAY,
    },
    items: b
      ? FIXTURE.items
          .filter((i) => i.business === b.id)
          .map((i) => ({ name: i.name, rate: String(i.ratePaise / 100), gstRate: i.gstRate }))
      : [],
    pick: pick.map((c) => ({ id: c.id, name: c.name, index: c.index })),
    mode,
    redo: redoBill?.number ?? null,
    live: null,
  };
}
