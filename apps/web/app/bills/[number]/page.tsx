import { notFound, redirect } from 'next/navigation';

import { loadBillView } from '../../../screens/bill-view/data';
import { BillViewScreen } from '../../../screens/bill-view/Screen';
import { getViewer, one, shellOf, type SearchParams } from '../../../screens/viewer';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ number: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const viewer = await getViewer(sp);
  if (!viewer.business) redirect('/');
  const { number } = await params;
  const data = await loadBillView(viewer, number);
  if (!data) notFound();
  return (
    <BillViewScreen
      data={data}
      viewer={shellOf(viewer)}
      openPaid={one(sp.paid) === '1' && viewer.role !== 'accountant'}
    />
  );
}
