import 'server-only';

import { documents, type BillRow, type Document, type TenantScope } from '@ekbill/db';
import { ageInDays, todayIst, type IssuedSnapshot } from '@ekbill/engine';
import type { PaperData } from '@ekbill/ui';

import { billsOf, rowOf, type RowData } from './common';
import { TODAY, longDate, type Bill } from './fixtures';
import { avatarIndex } from './people';
import type { Viewer } from './viewer';

/**
 * Stage 6: the bills are rows. A session reads the business's documents;
 * a look (?as=) and the signed-out demo still read the Stage 1 fixtures,
 * which keeps the approved screens and their baselines. Both come out in
 * the fixture shapes (Bill, RowData) the screens already draw, so a screen
 * changes only where it writes.
 */
export interface Ledger {
  /** True when the bills are the business's documents. */
  live: boolean;
  today: string;
  /** Newest first. */
  bills: Bill[];
  rows: RowData[];
}

/** The session's scope, or null for a look (?as=, the /flow review) and the signed-out demo: those read the fixtures. */
export function scopeOf(viewer: Viewer): TenantScope | null {
  return viewer.as ? null : (viewer.session?.scope ?? null);
}

/** The day the screens count from: the fixture's day for a look, the real day in India for a session. */
export function todayOf(viewer: Viewer): string {
  return scopeOf(viewer) ? todayIst(new Date()) : TODAY;
}

const METHODS = new Set(['upi', 'cash', 'bank', 'cheque', 'other']);

/** A bills-list row as the fixture Bill the screens draw (no lines: the list never shows them). */
export function billOfRow(viewer: Viewer, r: BillRow): Bill {
  const prefix = viewer.loaded?.series.find((s) => s.id === r.seriesId)?.prefix ?? '';
  return {
    id: r.id,
    business: viewer.business?.id ?? '',
    series: prefix.replace(/[-/]+$/, ''),
    number: r.number,
    fy: r.financialYear,
    customer: r.customerId ?? '',
    date: r.issueDate,
    lines: [],
    subtotalPaise: 0,
    gstPaise: 0,
    totalPaise: r.totalPaise,
    status: r.balance.status,
    paidPaise: r.balance.paidPaise,
    duePaise: r.balance.duePaise,
    paidOn: r.paidOn,
    method: (r.method && METHODS.has(r.method) ? r.method : null) as Bill['method'],
    cancelledReason: null,
    creditNote: null,
    waStatus: 'sent',
    kind: r.kind === 'bill_of_supply' ? 'bill-of-supply' : 'tax-invoice',
  };
}

export function rowOfLive(r: BillRow, today: string): RowData {
  return {
    number: r.number,
    fy: r.financialYear,
    customer: r.customerId ?? '',
    name: r.customerName,
    index: avatarIndex(r.customerId ?? r.id),
    date: r.issueDate,
    days: ageInDays(r.issueDate, today),
    totalPaise: r.totalPaise,
    duePaise: r.balance.duePaise,
    status: r.balance.status,
  };
}

export async function ledgerOf(
  viewer: Viewer,
  filter: { customerId?: string; q?: string; status?: 'all' | 'due' | 'paid' | 'cancelled'; since?: string } = {},
): Promise<Ledger> {
  const b = viewer.business;
  const scope = scopeOf(viewer);
  if (!b) return { live: Boolean(scope), today: todayOf(viewer), bills: [], rows: [] };
  if (!scope) {
    const bills = billsOf(b).filter(
      (x) => (!filter.customerId || x.customer === filter.customerId) && (!filter.since || x.date >= filter.since),
    );
    return { live: false, today: TODAY, bills, rows: bills.map((x) => rowOf(b, x)) };
  }
  const today = todayIst(new Date());
  const list = await documents.listBills(scope, filter);
  return {
    live: true,
    today,
    bills: list.map((r) => billOfRow(viewer, r)),
    rows: list.map((r) => rowOfLive(r, today)),
  };
}

/** What is unpaid, oldest first (the dues list and Home's card). */
export function unpaidRows(l: Ledger): RowData[] {
  return l.rows
    .filter((r) => r.status === 'due' || r.status === 'partial')
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** An issued document's lines in the fixture shape (the redo and "Pichle jaisa hi" read them). */
export function linesOf(doc: Document): Bill['lines'] {
  const taxed = (doc.issuedSnapshot as IssuedSnapshot | null)?.lines ?? doc.totals?.lines ?? [];
  return doc.lines.map((l, i) => ({
    what: l.description,
    qty: l.quantityMilli / 1000,
    ratePaise: l.unitPricePaise,
    gstRate: doc.gstOn ? l.gstBp / 100 : null,
    amountPaise: taxed[i]?.taxablePaise ?? 0,
  }));
}

/**
 * The paper the screens preview, from the issued snapshot only (I2): what
 * was issued is what is shown, whatever the profile says today. The logo
 * and signature are the files the snapshot names.
 */
export function paperOfDocument(doc: Document): PaperData {
  const s = doc.issuedSnapshot as IssuedSnapshot;
  // The legend is the snapshot's own: a composition dealer's bill of supply carries it, a regular business's does not.
  const legend = s.legend ?? null;
  return {
    title: s.title,
    seller: {
      name: s.seller.legalName,
      gstin: s.seller.gstin,
      address: [s.seller.address, s.seller.city].filter(Boolean).join(', ') || null,
    },
    number: doc.number ?? '',
    date: longDate(s.dateIso),
    customer: { name: s.customer.name, gstin: s.customer.gstin },
    lines: s.lines
      .filter((l) => !l.blank)
      .map((l) => ({
        description: l.description,
        qty: l.unit ? `${l.quantityMilli / 1000} ${l.unit}` : String(l.quantityMilli / 1000),
        rate: l.unitPricePaise,
        amount: l.taxablePaise,
      })),
    taxLines: s.totals.heads,
    totalPaise: s.totals.totalPaise,
    upiId: s.kind === 'credit-note' ? null : s.seller.upi,
    legend,
    logoUrl: s.seller.logoRef ? `/api/files/${s.seller.logoRef}` : null,
    signature: s.seller.signatureRef
      ? { url: `/api/files/${s.seller.signatureRef}`, forName: s.seller.legalName }
      : null,
  };
}
