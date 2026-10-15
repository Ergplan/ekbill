import { redirect } from 'next/navigation';

import { loadImport } from '../../../screens/import/data';
import { ImportScreen } from '../../../screens/import/Screen';
import { getViewer, one, shellOf, type SearchParams } from '../../../screens/viewer';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const viewer = await getViewer(sp);
  const data = await loadImport(viewer, { state: one(sp.state), n: one(sp.n), id: one(sp.id) });
  if (!data) redirect('/');
  return <ImportScreen data={data} viewer={shellOf(viewer)} />;
}
