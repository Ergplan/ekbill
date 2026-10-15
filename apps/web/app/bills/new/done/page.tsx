import { redirect } from 'next/navigation';

import { BillDoneScreen } from '../../../../screens/bill-done/Screen';
import { billsOf, customerOf } from '../../../../screens/common';
import { paperOfBill } from '../../../../screens/paper';
import { getViewer, shellOf, type SearchParams } from '../../../../screens/viewer';

export const dynamic = 'force-dynamic';

/**
 * The done screen renders the issued draft from sessionStorage; the newest
 * fixture bill is the fallback for screenshots. A brand-new owner has no
 * fixture bill: the issued draft is all there is, and the fallback stays blank.
 */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer(await searchParams);
  if (viewer.role === 'accountant') redirect('/');
  const b = viewer.business;
  if (!b) {
    const blank = {
      title: 'INVOICE',
      seller: { name: '' },
      number: 'INV-001',
      date: '',
      customer: { name: '' },
      lines: [],
      totalPaise: 0,
    };
    return <BillDoneScreen fallback={blank} share="pdf" viewer={shellOf(viewer)} />;
  }
  const bill = billsOf(b).find((x) => x.status !== 'cancelled')!;
  return (
    <BillDoneScreen
      fallback={paperOfBill(b, bill, customerOf(b, bill.customer))}
      share={b.look.share}
      viewer={shellOf(viewer)}
    />
  );
}
