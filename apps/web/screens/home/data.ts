import { TODAY, type Business } from '../fixtures';
import { billsOf, customersOf, rowOf, unpaidOf, type RowData } from '../common';
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

/** Home: three questions. Chips by recency; counts for this month; dues oldest first. */
export function loadHome(viewer: Viewer): HomeData {
  const b = viewer.business;
  if (!b) {
    return {
      kind: 'new',
      personName: viewer.person.name,
      businessName: null,
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
  const bills = billsOf(b);
  const customers = customersOf(b);
  const lastBillOf = new Map<string, string>();
  for (const bill of bills) if (!lastBillOf.has(bill.customer)) lastBillOf.set(bill.customer, bill.date);
  const byRecency = [...customers].sort((x, y) =>
    (lastBillOf.get(y.id) ?? '').localeCompare(lastBillOf.get(x.id) ?? ''),
  );
  const month = TODAY.slice(0, 7);
  const sent = bills.filter((x) => x.status !== 'cancelled');
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = Date.parse(TODAY) - (7 - i) * 7 * 86_400_000;
    const start = end - 7 * 86_400_000;
    return sent.filter((x) => Date.parse(x.date) > start && Date.parse(x.date) <= end).length;
  });
  const unpaid = unpaidOf(b);
  const rows = unpaid.map((x) => rowOf(b, x));
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
    recent: sent.slice(0, 3).map((x) => rowOf(b, x)),
    sparkline: weeks,
    owed: {
      totalPaise: rows.reduce((s, r) => s + r.duePaise, 0),
      people: new Set(rows.map((r) => r.customer)).size,
      oldestDays: rows[0]?.days ?? 0,
      rows: rows.slice(0, 3),
    },
  };
}
