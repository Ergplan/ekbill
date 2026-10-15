import { redirect } from 'next/navigation';

import { AapScreen } from '../../screens/aap/Screen';
import { FIXTURE } from '../../screens/fixtures';
import { getViewer, shellOf, type SearchParams } from '../../screens/viewer';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer(await searchParams);
  const b = viewer.business;
  if (!b) redirect('/');
  const team = FIXTURE.people.filter((p) => p.business === b.id).length;
  return (
    <AapScreen
      business={b}
      team={team}
      build={(process.env.NEXT_PUBLIC_BUILD_STAMP ?? 'dev').slice(0, 10)}
      viewer={shellOf(viewer)}
    />
  );
}
