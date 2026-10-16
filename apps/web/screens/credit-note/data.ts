import { series } from '@ekbill/db';
import { previewNumber } from '@ekbill/engine';

import { billOf, customerOf } from '../common';
import { FIXTURE } from '../fixtures';
import { loadBillView } from '../bill-view/data';
import { scopeOf } from '../live';
import type { Viewer } from '../viewer';

export interface CreditNoteData {
  number: string;
  customerName: string;
  totalPaise: number;
  nextNumber: string;
  /** What can still be credited (the bill less earlier credit notes). */
  creditablePaise: number;
  /** The real bill (Stage 6). */
  documentId: string | null;
}

/** The credit note form for a bill: the owner only; the next CN number from the business's series. */
export async function loadCreditNote(viewer: Viewer, number: string): Promise<CreditNoteData | null | 'forbidden'> {
  const b = viewer.business;
  if (!b || viewer.role !== 'owner') return 'forbidden';
  if (scopeOf(viewer)) {
    const v = await loadBillView(viewer, number);
    if (!v || !v.live || v.bill.status === 'cancelled') return null;
    const cn = viewer.loaded?.series.find((s) => s.kind === 'credit_note' && s.active);
    return {
      number: v.bill.number,
      customerName: v.customerName,
      totalPaise: v.bill.totalPaise,
      nextNumber: cn ? previewNumber(series.configOf(cn), v.live.today) : '',
      creditablePaise: Math.max(0, v.bill.totalPaise - v.live.creditedPaise),
      documentId: v.live.documentId,
    };
  }
  const bill = billOf(b, number);
  if (!bill) return null;
  const count = FIXTURE.creditNotes.filter((c) => c.business === b.id).length;
  return {
    number: bill.number,
    customerName: customerOf(b, bill.customer)?.name ?? '',
    totalPaise: bill.totalPaise,
    nextNumber: `CN-${String(count + 1).padStart(3, '0')}`,
    creditablePaise: bill.totalPaise,
    documentId: null,
  };
}
