import { redirect } from 'next/navigation';

import { loadHelp } from '../../screens/help/data';
import { HelpScreen } from '../../screens/help/Screen';
import { getViewer, shellOf, type SearchParams } from '../../screens/viewer';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer(await searchParams);
  const data = loadHelp(viewer);
  if (!data) redirect('/');
  return <HelpScreen help={data.help} viewer={shellOf(viewer)} />;
}
