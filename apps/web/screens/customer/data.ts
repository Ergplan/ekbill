import { NotFoundError, customers } from '@ekbill/db';

import { customerOf, type RowData } from '../common';
import { ledgerOf, scopeOf } from '../live';
import { avatarIndex, customerIdOf, customerViewOf, fixtureKeyOf, type CustomerView } from '../people';
import type { Viewer } from '../viewer';

export interface CustomerData {
  customer: CustomerView & { index: number };
  peeks: Array<{ title: string; sub: string; amountPaise: number }>;
  yearPaise: number;
  duePaise: number;
  paidRatio: number;
  timeline: Array<RowData & { paidOn: string | null; method: string | null; waStatus: 'sent' | 'read' }>;
}

/** The customer's folder: the row (Stage 5) and their bills with what each owes (Stage 6). */
export async function loadCustomer(viewer: Viewer, idOrKey: string): Promise<CustomerData | null> {
  const b = viewer.business;
  if (!b) return null;
  const scope = viewer.session?.scope;
  let customer: CustomerView & { index: number };
  let billKey: string | null = idOrKey;
  if (scope) {
    const id = customerIdOf(b.id, idOrKey);
    if (!id) return null;
    try {
      const row = await customers.getCustomer(scope, id);
      customer = { ...customerViewOf(row, b.id), index: avatarIndex(row.id) };
      // A look (?as=) reads the fixture bills, keyed by the fixture key.
      billKey = scopeOf(viewer) ? row.id : fixtureKeyOf(row.id);
    } catch (e) {
      if (e instanceof NotFoundError) return null;
      throw e;
    }
  } else {
    const c = customerOf(b, idOrKey);
    if (!c) return null;
    customer = { ...c, language: c.lang, email: null, address: null, city: null, pincode: null, archived: false };
  }
  const ledger = billKey ? await ledgerOf(viewer, { customerId: billKey }) : null;
  const bills = ledger?.bills ?? [];
  const today = ledger?.today ?? '';
  const year = bills.filter((x) => x.date.startsWith(today.slice(0, 4)) && x.status !== 'cancelled');
  const yearPaise = year.reduce((s, x) => s + x.totalPaise, 0);
  const duePaise = year.reduce((s, x) => s + x.duePaise, 0);
  return {
    customer,
    peeks: bills.slice(0, 3).map((x) => ({ title: x.number, sub: x.date, amountPaise: x.totalPaise })),
    yearPaise,
    duePaise,
    paidRatio: yearPaise ? (yearPaise - duePaise) / yearPaise : 1,
    timeline: bills.map((x, i) => ({
      ...ledger!.rows[i]!,
      paidOn: x.paidOn,
      method: x.method,
      waStatus: x.waStatus,
    })),
  };
}
