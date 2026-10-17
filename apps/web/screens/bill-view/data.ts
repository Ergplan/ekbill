import { localeOf, type Locale } from '@ekbill/copy';
import { NotFoundError, customers, documents } from '@ekbill/db';
import { ageInDays } from '@ekbill/engine';
import type { PaperData } from '@ekbill/ui';

import { FIXTURE, daysBetween, type Bill } from '../fixtures';
import { billOf, customerOf } from '../common';
import { safeDecode } from '../links';
import { billOfRow, linesOf, paperOfDocument, scopeOf, todayOf } from '../live';
import { paperOfBill } from '../paper';
import type { Viewer } from '../viewer';

export interface LedgerEntryView {
  id: string;
  kind: 'payment' | 'adjustment';
  amountPaise: number;
  date: string;
  method: string | null;
  note: string | null;
  reversed: boolean;
  reversalReason: string | null;
}

export interface BillViewData {
  bill: Bill;
  customerName: string;
  customerLang: Locale;
  customerPhone: string | null;
  days: number;
  paper: PaperData;
  creditNote: { number: string; amountPaise: number; reason: string } | null;
  share: 'pdf' | 'jpg';
  /** The real document behind the view (Stage 6); null for a look at the fixtures. */
  live: {
    documentId: string;
    today: string;
    entries: LedgerEntryView[];
    creditedPaise: number;
    adjustedPaise: number;
    reminders: number;
    /** The paper the business prints on, for the download link. */
    paperSize: 'a4' | 'a5' | '80mm' | '58mm';
  } | null;
}

export async function loadBillView(viewer: Viewer, number: string, fy?: string | null): Promise<BillViewData | null> {
  const b = viewer.business;
  if (!b) return null;
  const scope = scopeOf(viewer);
  if (scope) {
    const id = await documents.findBill(scope, safeDecode(number), fy);
    if (!id) return null;
    let view;
    try {
      view = await documents.billView(scope, id);
    } catch (e) {
      if (e instanceof NotFoundError) return null;
      throw e;
    }
    const doc = view.document;
    if (doc.kind === 'credit_note') return null;
    const today = todayOf(viewer);
    const lastPaid = [...view.entries].reverse().find((e) => e.kind === 'payment' && !e.reversedAt) ?? null;
    const note = view.creditNotes.find((n) => n.status === 'issued') ?? null;
    const bill: Bill = {
      ...billOfRow(viewer, {
        id: doc.id,
        number: doc.number ?? '',
        financialYear: doc.financialYear,
        kind: doc.kind,
        status: doc.status,
        issueDate: doc.issueDate,
        customerId: doc.customerId,
        customerName: doc.customerName,
        seriesId: doc.seriesId,
        totalPaise: doc.totals?.totalPaise ?? 0,
        balance: view.balance,
        linkedDocumentId: doc.linkedDocumentId,
        paidOn: lastPaid?.date ?? null,
        method: lastPaid?.method ?? null,
      }),
      lines: linesOf(doc),
      subtotalPaise: doc.totals?.subtotalPaise ?? 0,
      gstPaise: doc.totals?.gstPaise ?? 0,
      cancelledReason: doc.cancelledReason,
      creditNote: note?.number ?? null,
    };
    const customer = doc.customerId ? await customers.getCustomer(scope, doc.customerId).catch(() => null) : null;
    return {
      bill,
      customerName: doc.customerName,
      customerLang: localeOf(customer?.language),
      customerPhone: customer?.phone ?? doc.customerPhone,
      days: ageInDays(doc.issueDate, today),
      paper: paperOfDocument(doc),
      creditNote: note
        ? { number: note.number ?? '', amountPaise: note.totals?.totalPaise ?? 0, reason: note.notes ?? '' }
        : null,
      share: b.look.share,
      live: {
        documentId: doc.id,
        today,
        entries: view.entries.map((e) => ({
          id: e.id,
          kind: e.kind as LedgerEntryView['kind'],
          amountPaise: e.amountPaise,
          date: e.date,
          method: e.method,
          note: e.note,
          reversed: e.reversedAt !== null,
          reversalReason: e.reversalReason,
        })),
        creditedPaise: view.balance.creditedPaise,
        adjustedPaise: view.balance.adjustedPaise,
        reminders: view.reminders.length,
        paperSize: viewer.loaded?.profile.look.paper ?? 'a4',
      },
    };
  }
  const bill = billOf(b, number);
  if (!bill) return null;
  const customer = customerOf(b, bill.customer);
  const cn = bill.creditNote ? (FIXTURE.creditNotes.find((c) => c.number === bill.creditNote) ?? null) : null;
  return {
    bill,
    customerName: customer?.name ?? bill.customer,
    customerLang: customer?.lang ?? 'hi-Latn',
    customerPhone: customer?.phone ?? null,
    days: daysBetween(bill.date),
    paper: paperOfBill(b, bill, customer),
    creditNote: cn ? { number: cn.number, amountPaise: cn.amountPaise, reason: cn.reason } : null,
    share: b.look.share,
    live: null,
  };
}
