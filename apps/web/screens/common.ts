import { FIXTURE, daysBetween, type Bill, type Business, type Customer } from './fixtures';

/** Customers of a business, with the stable index that picks the avatar colour. */
export function customersOf(business: Business): Array<Customer & { index: number }> {
  return FIXTURE.customers.filter((c) => c.business === business.id).map((c, index) => ({ ...c, index }));
}
export function customerOf(business: Business, id: string): (Customer & { index: number }) | null {
  return customersOf(business).find((c) => c.id === id) ?? null;
}
export function billsOf(business: Business): Bill[] {
  return FIXTURE.bills
    .filter((b) => b.business === business.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
}
export function billOf(business: Business, number: string): Bill | null {
  return billsOf(business).find((b) => b.number === number) ?? null;
}
export function unpaidOf(business: Business): Bill[] {
  return billsOf(business)
    .filter((b) => b.status === 'due' || b.status === 'partial')
    .sort((a, b) => a.date.localeCompare(b.date));
}
export interface RowData {
  number: string;
  fy?: string | null;
  customer: string;
  name: string;
  index: number;
  date: string;
  days: number;
  totalPaise: number;
  duePaise: number;
  status: Bill['status'];
}
export function rowOf(business: Business, b: Bill): RowData {
  const c = customerOf(business, b.customer);
  return {
    number: b.number,
    fy: b.fy ?? null,
    customer: b.customer,
    name: c?.name ?? b.customer,
    index: c?.index ?? 0,
    date: b.date,
    days: daysBetween(b.date),
    totalPaise: b.totalPaise,
    duePaise: b.duePaise,
    status: b.status,
  };
}
/** The pill word for a bill's state. */
export function statusKey(status: Bill['status']): string {
  return status === 'paid'
    ? 'status.paid'
    : status === 'partial'
      ? 'status.partial'
      : status === 'cancelled'
        ? 'status.cancelled'
        : 'status.due';
}
