import { redirect } from 'next/navigation';

import { loadDues } from '../../screens/dues/data';
import { DuesScreen } from '../../screens/dues/Screen';
import { getViewer, shellOf, type SearchParams } from '../../screens/viewer';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer(await searchParams);
  if (!viewer.business) redirect('/');
  return <DuesScreen data={loadDues(viewer)} viewer={shellOf(viewer)} />;
}
