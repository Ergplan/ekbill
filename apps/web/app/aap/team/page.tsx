import { redirect } from 'next/navigation';

import { loadTeam } from '../../../screens/team/data';
import { TeamScreen } from '../../../screens/team/Screen';
import { getViewer, shellOf, type SearchParams } from '../../../screens/viewer';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer(await searchParams);
  if (!viewer.business || viewer.role !== 'owner') redirect('/aap');
  return <TeamScreen members={loadTeam(viewer)} viewer={shellOf(viewer)} />;
}
