import { redirect } from 'next/navigation';

import { loadAsk } from '../../screens/ask/data';
import { AskScreen } from '../../screens/ask/Screen';
import { getViewer, one, shellOf, type SearchParams } from '../../screens/viewer';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const viewer = await getViewer(sp);
  const data = await loadAsk(viewer, { state: one(sp.state) });
  if (!data) redirect('/');
  return <AskScreen ask={data.ask} state={data.state} live={data.live} viewer={shellOf(viewer)} />;
}
