import { billOf, customerOf } from '../common';
import { FIXTURE } from '../fixtures';
import type { Viewer } from '../viewer';

export interface CreditNoteData {
  number: string;
  customerName: string;
  totalPaise: number;
  nextNumber: string;
}

/** The credit note form for a bill: the owner only; the next CN number from the business's series. */
export function loadCreditNote(viewer: Viewer, number: string): CreditNoteData | null | 'forbidden' {
  const b = viewer.business;
  if (!b || viewer.role !== 'owner') return 'forbidden';
  const bill = billOf(b, number);
  if (!bill) return null;
  const count = FIXTURE.creditNotes.filter((c) => c.business === b.id).length;
  return {
    number: bill.number,
    customerName: customerOf(b, bill.customer)?.name ?? '',
    totalPaise: bill.totalPaise,
    nextNumber: `CN-${String(count + 1).padStart(3, '0')}`,
  };
}
