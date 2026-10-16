import { t } from '@ekbill/copy';

import { daysBetween, shortDate, type Bill } from '../fixtures';
import { billOf, customerOf } from '../common';
import { billFileName } from '../links';
import { rupees } from '../money';
import { loadBillView } from '../bill-view/data';
import { scopeOf } from '../live';
import type { Viewer } from '../viewer';

export interface RemindData {
  bill: Pick<Bill, 'number' | 'date' | 'duePaise'>;
  customerName: string;
  contact: string;
  /** The customer's number, for the WhatsApp chat (null: the share sheet asks). */
  phone: string | null;
  lang: 'hi-Latn' | 'en';
  days: number;
  share: 'pdf' | 'jpg';
  fileName: string;
  messages: Record<'hi-Latn' | 'en', { gentle: string; direct: string; second: string }>;
  /** The real bill (Stage 6): the reminder is recorded against it and the file attached. */
  live: { documentId: string; paperSize: 'a4' | 'a5' | '80mm' | '58mm'; sent: number } | null;
}

interface Who {
  name: string;
  contact: string;
  phone: string | null;
  lang: 'hi-Latn' | 'en';
}

function build(
  viewer: Viewer,
  bill: Pick<Bill, 'number' | 'date' | 'duePaise'>,
  who: Who,
  days: number,
  live: RemindData['live'],
): RemindData {
  const b = viewer.business!;
  const params = {
    contact: who.contact || who.name,
    customer: b.name,
    business: b.name,
    days,
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
    customerName: who.name,
    contact: who.contact,
    phone: who.phone,
    lang: who.lang,
    days,
    share: b.look.share,
    fileName: billFileName(bill.number, b.look.share === 'pdf' ? 'pdf' : 'jpg'),
    messages: { 'hi-Latn': msgs('hi-Latn'), en: msgs('en') },
    live,
  };
}

/** The reminder for one bill: three tones in the customer's language (Hinglish or English; KNOWN-GAPS for the rest). */
export async function loadRemind(viewer: Viewer, number: string): Promise<RemindData | null> {
  const b = viewer.business;
  if (!b) return null;
  if (scopeOf(viewer)) {
    const v = await loadBillView(viewer, number);
    if (!v || !v.live) return null;
    return build(
      viewer,
      v.bill,
      { name: v.customerName, contact: '', phone: v.customerPhone, lang: v.customerLang },
      v.days,
      { documentId: v.live.documentId, paperSize: v.live.paperSize, sent: v.live.reminders },
    );
  }
  const bill = billOf(b, number);
  if (!bill) return null;
  const c = customerOf(b, bill.customer);
  return build(
    viewer,
    bill,
    { name: c?.name ?? bill.customer, contact: c?.contact ?? '', phone: c?.phone ?? null, lang: c?.lang ?? 'hi-Latn' },
    daysBetween(bill.date),
    null,
  );
}
