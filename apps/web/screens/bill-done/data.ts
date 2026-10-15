import type { PaperData } from '@ekbill/ui';

import { billsOf, customerOf } from '../common';
import { paperOfBill } from '../paper';
import type { Viewer } from '../viewer';

export interface BillDoneData {
  /** The paper the screen shows until the issued draft (sessionStorage) replaces it; blank for a brand-new owner. */
  fallback: PaperData;
  share: 'pdf' | 'jpg';
}

/** The done screen's data: the newest fixture bill as the fallback paper, the business's share format. */
export function loadBillDone(viewer: Viewer): BillDoneData | null {
  if (viewer.role === 'accountant') return null;
  const b = viewer.business;
  if (!b) {
    return {
      fallback: {
        title: 'INVOICE',
        seller: { name: '' },
        number: 'INV-001',
        date: '',
        customer: { name: '' },
        lines: [],
        totalPaise: 0,
      },
      share: 'pdf',
    };
  }
  const bill = billsOf(b).find((x) => x.status !== 'cancelled');
  if (!bill) return null;
  return { fallback: paperOfBill(b, bill, customerOf(b, bill.customer)), share: b.look.share };
}
