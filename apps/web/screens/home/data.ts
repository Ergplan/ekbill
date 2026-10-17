import { customers as customerRepo } from '@ekbill/db';

import { type Business } from '../fixtures';
import { customersOf, type RowData } from '../common';
import { ledgerOf, scopeOf, todayOf, unpaidRows } from '../live';
import { avatarIndex } from '../people';
import type { Viewer } from '../viewer';

export interface HomeData {
  kind: 'owner' | 'staff' | 'accountant' | 'new';
  personName: string;
  businessName: string | null;
  city: string | null;
  registration: Business['registration'] | null;
  chips: Array<{ id: string; name: string; index: number }>;
  customerCount: number;
  showSearch: boolean;
  sentThisMonth: number;
  recent: RowData[];
  sparkline: number[];
  owed: { totalPaise: number; people: number; oldestDays: number; rows: RowData[] };
}

/** Home: three questions. Chips by recency; counts for this month; dues oldest first (Stage 6: the documents). */
export async function loadHome(viewer: Viewer): Promise<HomeData> {
  const b = viewer.business;
  const scope = scopeOf(viewer);
  // Home reads eight weeks of bills (the sparkline, this month, the last three), not the whole book (Stage 10).
  const since = new Date(Date.parse(`${todayOf(viewer)}T00:00:00Z`) - 63 * 86_400_000).toISOString().slice(0, 10);
  const ledger = await ledgerOf(viewer, scope ? { since } : {});
  const rows0 = scope ? await customerRepo.listCustomers(scope) : null;
  const customers = !b
    ? []
    : rows0
      ? rows0.map((c) => ({ id: c.id, name: c.name, index: avatarIndex(c.id), lastBilledAt: c.lastBilledAt }))
      : customersOf(b).map((c) => ({ id: c.id, name: c.name, index: c.index, lastBilledAt: null as string | null }));
  // No business yet, or a business set up today with nothing in it: the first-bill welcome.
  if (!b || (ledger.bills.length === 0 && customers.length === 0)) {
    return {
      kind: 'new',
      personName: viewer.person.name,
      businessName: b?.name ?? null,
      city: null,
      registration: null,
      chips: [],
      customerCount: 0,
      showSearch: false,
      sentThisMonth: 0,
      recent: [],
      sparkline: [0, 0, 0, 0, 0, 0, 0, 0],
      owed: { totalPaise: 0, people: 0, oldestDays: 0, rows: [] },
    };
  }
  const bills = ledger.bills;
  const today = ledger.today;
  const lastBillOf = new Map<string, string>();
  for (const bill of bills) if (!lastBillOf.has(bill.customer)) lastBillOf.set(bill.customer, bill.date);
  // A customer last billed before the eight weeks keeps their place by the date on their row.
  for (const c of customers) if (!lastBillOf.has(c.id) && c.lastBilledAt) lastBillOf.set(c.id, c.lastBilledAt);
  const byRecency = [...customers].sort((x, y) =>
    (lastBillOf.get(y.id) ?? '').localeCompare(lastBillOf.get(x.id) ?? ''),
  );
  const month = today.slice(0, 7);
  const sent = bills.filter((x) => x.status !== 'cancelled');
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = Date.parse(today) - (7 - i) * 7 * 86_400_000;
    const start = end - 7 * 86_400_000;
    return sent.filter((x) => Date.parse(x.date) > start && Date.parse(x.date) <= end).length;
  });
  // Dues are asked for as dues (Stage 10): a business with more bills than one list holds still sees its oldest.
  const rows = unpaidRows(ledger.live ? await ledgerOf(viewer, { status: 'due' }) : ledger);
  const rowOfBill = new Map(ledger.bills.map((x, i) => [x, ledger.rows[i]!]));
  // The last three are the last three, however long ago (Stage 10 review: a business with no bill in eight weeks
  // showed none); the eight weeks still decide this month and the sparkline.
  const older = ledger.live && sent.length < 3 ? await ledgerOf(viewer, { limit: 6 }) : null;
  const recent = older
    ? older.rows.filter((_, i) => older.bills[i]!.status !== 'cancelled').slice(0, 3)
    : sent.slice(0, 3).map((x) => rowOfBill.get(x)!);
  return {
    kind: viewer.role === 'owner' ? 'owner' : viewer.role,
    personName: viewer.person.name,
    businessName: b.name,
    city: b.city,
    registration: b.registration,
    chips: byRecency.slice(0, customers.length > 8 ? 6 : 8).map((c) => ({ id: c.id, name: c.name, index: c.index })),
    customerCount: customers.length,
    showSearch: customers.length > 8,
    sentThisMonth: sent.filter((x) => x.date.startsWith(month)).length,
    recent,
    sparkline: weeks,
    owed: {
      totalPaise: rows.reduce((s, r) => s + r.duePaise, 0),
      people: new Set(rows.map((r) => r.customer)).size,
      oldestDays: rows[0]?.days ?? 0,
      rows: rows.slice(0, 3),
    },
  };
}
