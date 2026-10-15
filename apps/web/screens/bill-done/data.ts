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
  const brand = viewer.loaded
    ? {
        logoUrl: viewer.loaded.logoUrl,
        signature: viewer.loaded.signatureUrl
          ? { url: viewer.loaded.signatureUrl, forName: viewer.loaded.profile.legalName }
          : null,
      }
    : {};
  if (!bill) {
    // A business the fixtures do not know (set up today): a sample bill with the real seller on it.
    return {
      fallback: {
        title: b.registration === 'regular' ? 'TAX INVOICE' : 'INVOICE',
        seller: { name: b.name, gstin: b.gstin, address: [b.address, b.city].filter(Boolean).join(', ') },
        number: b.series[0] ? `${b.series[0].prefix}${String(b.series[0].next).padStart(3, '0')}` : 'INV-001',
        date: '',
        customer: { name: 'Sample customer' },
        lines: [{ description: 'Sample work', qty: '1', rate: 100000, amount: 100000 }],
        totalPaise: 100000,
        upiId: b.upi,
        ...brand,
      },
      share: b.look.share,
    };
  }
  return { fallback: { ...paperOfBill(b, bill, customerOf(b, bill.customer)), ...brand }, share: b.look.share };
}
