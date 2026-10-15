import { redirect } from 'next/navigation';

import { loadBillDone } from '../../../../screens/bill-done/data';
import { BillDoneScreen } from '../../../../screens/bill-done/Screen';
import { getViewer, shellOf, type SearchParams } from '../../../../screens/viewer';

export const dynamic = 'force-dynamic';

/** The done screen renders the issued draft from sessionStorage; the loader's fallback paper serves the screenshots. */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer(await searchParams);
  const data = loadBillDone(viewer);
  if (!data) redirect('/');
  return <BillDoneScreen fallback={data.fallback} share={data.share} viewer={shellOf(viewer)} />;
}
