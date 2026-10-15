import { billsOf, customersOf } from '../common';
import type { Viewer } from '../viewer';

export interface CustomerRow {
  id: string;
  name: string;
  index: number;
  phone: string | null;
  gstin: string | null;
  duePaise: number;
  lastDate: string | null;
}

export function loadCustomers(viewer: Viewer): CustomerRow[] {
  const b = viewer.business;
  if (!b) return [];
  const bills = billsOf(b);
  return customersOf(b)
    .map((c) => {
      const mine = bills.filter((x) => x.customer === c.id);
      return {
        id: c.id,
        name: c.name,
        index: c.index,
        phone: c.phone,
        gstin: c.gstin,
        duePaise: mine.reduce((s, x) => s + x.duePaise, 0),
        lastDate: mine[0]?.date ?? null,
      };
    })
    .sort((x, y) => (y.lastDate ?? '').localeCompare(x.lastDate ?? '') || x.name.localeCompare(y.name));
}
