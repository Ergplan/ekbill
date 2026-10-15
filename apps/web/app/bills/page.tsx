import { redirect } from 'next/navigation';

import { loadBills } from '../../screens/bills/data';
import { BillsScreen } from '../../screens/bills/Screen';
import { getViewer, shellOf, type SearchParams } from '../../screens/viewer';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer(await searchParams);
  if (!viewer.business) redirect('/');
  return <BillsScreen data={loadBills(viewer)} viewer={shellOf(viewer)} />;
}
