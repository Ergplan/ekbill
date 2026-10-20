import type { PaperData } from '@ekbill/ui';

import { billLinks, customers, documents } from '@ekbill/db';

import { billsOf, customerOf } from '../common';
import { paperOfDocument, scopeOf } from '../live';
import { paperOfBill } from '../paper';
import type { Viewer } from '../viewer';

export interface BillDoneData {
  /** The paper the screen shows until the issued draft (sessionStorage) replaces it; blank for a brand-new owner. */
  fallback: PaperData;
  share: 'pdf' | 'jpg';
  /** The issued bill (Stage 6): the paper from its snapshot, the file to share, the customer's number. */
  live: {
    documentId: string;
    number: string;
    customerId: string | null;
    customerName: string;
    customerPhone: string | null;
    totalPaise: number;
    paper: PaperData;
    paperSize: 'a4' | 'a5' | '80mm' | '58mm';
    /** A kaccha bill (estimate, 20 Oct): its own words, and "Pakka bill banao" from it. */
    kaccha: boolean;
    /** The bill's own link for the WhatsApp message (the customer opens it without signing in). */
    link: string | null;
  } | null;
}

/** The done screen of a bill just issued, by its id (the form sends you here). */
export async function loadIssued(viewer: Viewer, id: string, origin: string): Promise<BillDoneData | null> {
  const scope = scopeOf(viewer);
  if (!scope || !viewer.business || viewer.role === 'accountant') return null;
  const docId = await documents.findBill(scope, id);
  if (!docId) return null;
  const doc = await documents.getDocument(scope, docId);
  if (doc.status !== 'issued' || doc.kind === 'credit_note') return null;
  const customer = doc.customerId ? await customers.getCustomer(scope, doc.customerId).catch(() => null) : null;
  const paper = paperOfDocument(doc);
  const token = await billLinks.linkFor(scope, doc.id).catch(() => null);
  return {
    fallback: paper,
    share: viewer.business.look.share,
    live: {
      documentId: doc.id,
      number: doc.number ?? '',
      customerId: doc.customerId,
      customerName: doc.customerName,
      customerPhone: customer?.phone ?? doc.customerPhone,
      totalPaise: doc.totals?.totalPaise ?? 0,
      paper,
      paperSize: viewer.loaded?.profile.look.paper ?? 'a4',
      kaccha: doc.kind === 'estimate',
      link: token ? `${origin}/b/${token}` : null,
    },
  };
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
      live: null,
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
      live: null,
    };
  }
  return {
    fallback: { ...paperOfBill(b, bill, customerOf(b, bill.customer)), ...brand },
    share: b.look.share,
    live: null,
  };
}
