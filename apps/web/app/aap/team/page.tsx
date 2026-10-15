import { redirect } from 'next/navigation';

import { FIXTURE } from '../../../screens/fixtures';
import { TeamScreen } from '../../../screens/team/Screen';
import { getViewer, shellOf, type SearchParams } from '../../../screens/viewer';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer(await searchParams);
  const b = viewer.business;
  if (!b || viewer.role !== 'owner') redirect('/aap');
  return <TeamScreen members={FIXTURE.people.filter((p) => p.business === b.id)} viewer={shellOf(viewer)} />;
}
