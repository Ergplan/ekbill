import { TODAY, type Customer } from '../fixtures';
import { billsOf, customerOf, rowOf, type RowData } from '../common';
import type { Viewer } from '../viewer';

export interface CustomerData {
  customer: Customer & { index: number };
  peeks: Array<{ title: string; sub: string; amountPaise: number }>;
  yearPaise: number;
  duePaise: number;
  paidRatio: number;
  timeline: Array<RowData & { paidOn: string | null; method: string | null; waStatus: 'sent' | 'read' }>;
}

export function loadCustomer(viewer: Viewer, id: string): CustomerData | null {
  const b = viewer.business;
  if (!b) return null;
  const customer = customerOf(b, id);
  if (!customer) return null;
  const bills = billsOf(b).filter((x) => x.customer === id);
  const year = bills.filter((x) => x.date.startsWith(TODAY.slice(0, 4)) && x.status !== 'cancelled');
  const yearPaise = year.reduce((s, x) => s + x.totalPaise, 0);
  const duePaise = year.reduce((s, x) => s + x.duePaise, 0);
  return {
    customer,
    peeks: bills.slice(0, 3).map((x) => ({ title: x.number, sub: x.date, amountPaise: x.totalPaise })),
    yearPaise,
    duePaise,
    paidRatio: yearPaise ? (yearPaise - duePaise) / yearPaise : 1,
    timeline: bills.map((x) => ({ ...rowOf(b, x), paidOn: x.paidOn, method: x.method, waStatus: x.waStatus })),
  };
}
