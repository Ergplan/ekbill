import { customers } from '@ekbill/db';

import { billsOf, customersOf } from '../common';
import { avatarIndex, fixtureKeyOf } from '../people';
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

/** The directory: the business's customers (Stage 5: the rows), with what the bills say they owe. */
export async function loadCustomers(viewer: Viewer): Promise<CustomerRow[]> {
  const b = viewer.business;
  if (!b) return [];
  const bills = billsOf(b);
  const owed = (key: string | null) => {
    const mine = key ? bills.filter((x) => x.customer === key) : [];
    return { duePaise: mine.reduce((s, x) => s + x.duePaise, 0), lastDate: mine[0]?.date ?? null };
  };
  const scope = viewer.session?.scope;
  const rows = scope
    ? (await customers.listCustomers(scope)).map((c) => ({
        id: c.id,
        name: c.name,
        index: avatarIndex(c.id),
        phone: c.phone,
        gstin: c.gstin,
        ...owed(fixtureKeyOf(c.id)),
      }))
    : customersOf(b).map((c) => ({
        id: c.id,
        name: c.name,
        index: c.index,
        phone: c.phone,
        gstin: c.gstin,
        ...owed(c.id),
      }));
  return rows.sort((x, y) => (y.lastDate ?? '').localeCompare(x.lastDate ?? '') || x.name.localeCompare(y.name));
}
