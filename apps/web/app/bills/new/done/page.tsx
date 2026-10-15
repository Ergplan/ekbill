import { redirect } from 'next/navigation';

import { BillDoneScreen } from '../../../../screens/bill-done/Screen';
import { loadBillDone } from '../../../../screens/bill-done/data';
import { getViewer, shellOf, type SearchParams } from '../../../../screens/viewer';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer(await searchParams);
  if (viewer.role === 'accountant') redirect('/');
  const data = loadBillDone(viewer);
  return <BillDoneScreen fallback={data.fallback} share={data.share} viewer={shellOf(viewer)} />;
}
