import { t } from '@ekbill/copy';

import { daysBetween, shortDate, type Bill } from '../fixtures';
import { billOf, customerOf } from '../common';
import { rupees } from '../money';
import type { Viewer } from '../viewer';

export interface RemindData {
  bill: Pick<Bill, 'number' | 'date' | 'duePaise'>;
  customerName: string;
  contact: string;
  lang: 'hi-Latn' | 'en';
  days: number;
  share: 'pdf' | 'jpg';
  fileName: string;
  messages: Record<'hi-Latn' | 'en', { gentle: string; direct: string; second: string }>;
}

export function loadRemind(viewer: Viewer, number: string): RemindData | null {
  const b = viewer.business;
  if (!b) return null;
  const bill = billOf(b, number);
  if (!bill) return null;
  const c = customerOf(b, bill.customer);
  const params = {
    contact: c?.contact ?? c?.name ?? '',
    customer: b.name,
    business: b.name,
    number: bill.number,
    amount: rupees(bill.duePaise),
    date: shortDate(bill.date),
    upi: b.upi ?? '',
  };
  const msgs = (locale: 'hi-Latn' | 'en') => ({
    gentle: t('remind.msg.warm', params, locale),
    direct: t('remind.msg.direct', params, locale),
    second: t('remind.msg.second', params, locale),
  });
  return {
    bill: { number: bill.number, date: bill.date, duePaise: bill.duePaise },
    customerName: c?.name ?? bill.customer,
    contact: c?.contact ?? '',
    lang: c?.lang ?? 'hi-Latn',
    days: daysBetween(bill.date),
    share: b.look.share,
    fileName: `${bill.number}.${b.look.share === 'pdf' ? 'pdf' : 'jpg'}`,
    messages: { 'hi-Latn': msgs('hi-Latn'), en: msgs('en') },
  };
}
