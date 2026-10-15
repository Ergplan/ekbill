import { FIXTURE, TODAY, type Business } from '../fixtures';
import { billsOf, customerOf, customersOf } from '../common';
import type { Viewer } from '../viewer';
import type { BillDraft } from './compute';

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
    phone: string | null;
  } | null;
  /** The previous bill for this customer, for "Pichle jaisa hi?" */
  previous: {
    month: string;
    lines: Array<{ what: string; qty: string; rate: string }>;
    totalPaise: number;
    gstRate: number | null;
  } | null;
  /** The draft the form opens with (number from the series, today's date). */
  initial: BillDraft;
  /** Item suggestions for "Kya kiya?" */
  items: Array<{ name: string; rate: string; gstRate: number | null }>;
  /** For the picker (bill-start): customers by recency. */
  pick: Array<{ id: string; name: string; index: number }>;
  mode: 'existing' | 'new-customer' | 'first';
  /** The cancelled bill this one redoes (its lines start the draft), else null. */
  redo: string | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function loadBillForm(
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
      }
    : null;
  // The fixture's failing check: a customer without a state on a regular business.
  const customerState = opts.state === 'check-fail' ? null : (customer?.stateCode ?? null);
  const mode = opts.first ? 'first' : opts.newCustomer || !customer ? 'new-customer' : 'existing';
  const bills = b ? billsOf(b) : [];
  const last = new Map<string, string>();
  for (const x of bills) if (!last.has(x.customer)) last.set(x.customer, x.date);
  // The bill being redone. Its cancellation happened on the bill screen a moment ago and the fixture does
  // not change, so the status is not checked here; Stage 5 reads the cancelled document instead.
  const redoBill = b && opts.redo ? billsOf(b).find((x) => x.number === opts.redo) : null;
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
          phone: customer.phone,
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
        mode: 'one',
        rate: redoBill?.lines[0]?.gstRate ?? previous?.gstRate ?? defaultRate,
        perLine: [],
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
  };
}
