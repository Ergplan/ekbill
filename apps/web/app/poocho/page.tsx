import { redirect } from 'next/navigation';

import { AskScreen } from '../../screens/ask/Screen';
import { FIXTURE } from '../../screens/fixtures';
import { getViewer, one, shellOf, type SearchParams } from '../../screens/viewer';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const viewer = await getViewer(sp);
  if (!viewer.business) redirect('/');
  return (
    <AskScreen ask={FIXTURE.ask} state={one(sp.state) === 'answered' ? 'answered' : 'empty'} viewer={shellOf(viewer)} />
  );
}
