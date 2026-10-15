import { redirect } from 'next/navigation';

import { loadImport } from '../../../screens/import/data';
import { ImportScreen } from '../../../screens/import/Screen';
import { getViewer, one, shellOf, type SearchParams } from '../../../screens/viewer';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const viewer = await getViewer(sp);
  const data = loadImport(viewer, { state: one(sp.state), n: one(sp.n) });
  if (!data) redirect('/');
  return <ImportScreen state={data.state} preview={data.preview} added={data.added} viewer={shellOf(viewer)} />;
}
