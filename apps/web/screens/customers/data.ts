import { customers } from '@ekbill/db';

import { customersOf } from '../common';
import { ledgerOf } from '../live';
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

/** The directory: the business's customers (Stage 5: the rows), with what their bills owe (Stage 6: balanceOf). */
export async function loadCustomers(viewer: Viewer): Promise<CustomerRow[]> {
  const b = viewer.business;
  if (!b) return [];
  const ledger = await ledgerOf(viewer);
  const bills = ledger.bills;
  // What each owes comes from the dues themselves (Stage 10), not from the newest bills only.
  const dueBills = ledger.live ? (await ledgerOf(viewer, { status: 'due' })).bills : bills;
  const owed = (key: string | null) => {
    const mine = key ? bills.filter((x) => x.customer === key) : [];
    const due = key ? dueBills.filter((x) => x.customer === key) : [];
    return { duePaise: due.reduce((s, x) => s + x.duePaise, 0), lastDate: mine[0]?.date ?? null };
  };
  const scope = viewer.session?.scope;
  const rows = scope
    ? (await customers.listCustomers(scope)).map((c) => ({
        id: c.id,
        name: c.name,
        index: avatarIndex(c.id),
        phone: c.phone,
        gstin: c.gstin,
        // A look (?as=) with a session: the rows are real, the bills the fixtures' (keyed by fixture key).
        ...owed(ledger.live ? c.id : fixtureKeyOf(c.id)),
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
