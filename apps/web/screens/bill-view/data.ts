import type { PaperData } from '@ekbill/ui';

import { FIXTURE, daysBetween, type Bill } from '../fixtures';
import { billOf, customerOf } from '../common';
import { paperOfBill } from '../paper';
import type { Viewer } from '../viewer';

export interface BillViewData {
  bill: Bill;
  customerName: string;
  customerLang: 'hi-Latn' | 'en';
  days: number;
  paper: PaperData;
  creditNote: { number: string; amountPaise: number; reason: string } | null;
  share: 'pdf' | 'jpg';
}

export function loadBillView(viewer: Viewer, number: string): BillViewData | null {
  const b = viewer.business;
  if (!b) return null;
  const bill = billOf(b, number);
  if (!bill) return null;
  const customer = customerOf(b, bill.customer);
  const cn = bill.creditNote ? (FIXTURE.creditNotes.find((c) => c.number === bill.creditNote) ?? null) : null;
  return {
    bill,
    customerName: customer?.name ?? bill.customer,
    customerLang: customer?.lang ?? 'hi-Latn',
    days: daysBetween(bill.date),
    paper: paperOfBill(b, bill, customer),
    creditNote: cn ? { number: cn.number, amountPaise: cn.amountPaise, reason: cn.reason } : null,
    share: b.look.share,
  };
}
