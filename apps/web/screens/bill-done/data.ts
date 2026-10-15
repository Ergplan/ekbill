import type { PaperData } from '@ekbill/ui';

import { billsOf, customerOf } from '../common';
import { paperOfBill } from '../paper';
import type { Viewer } from '../viewer';

export interface BillDoneData {
  /** The paper the screen shows until the issued draft arrives from sessionStorage (and for screenshots). */
  fallback: PaperData;
  share: 'pdf' | 'jpg';
}

/**
 * The done screen renders the issued draft from sessionStorage; the newest
 * fixture bill is the fallback for screenshots. A brand-new owner has no
 * fixture bill: the issued draft is all there is, and the fallback stays blank.
 */
export function loadBillDone(viewer: Viewer): BillDoneData {
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
  const bill = billsOf(b).find((x) => x.status !== 'cancelled')!;
  return { fallback: paperOfBill(b, bill, customerOf(b, bill.customer)), share: b.look.share };
}
