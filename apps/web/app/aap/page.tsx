import { redirect } from 'next/navigation';

import { loadAap } from '../../screens/aap/data';
import { AapScreen } from '../../screens/aap/Screen';
import { getViewer, shellOf, type SearchParams } from '../../screens/viewer';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer(await searchParams);
  const data = loadAap(viewer, (process.env.NEXT_PUBLIC_BUILD_STAMP ?? 'dev').slice(0, 10));
  if (!data) redirect('/');
  return <AapScreen business={data.business} team={data.team} build={data.build} viewer={shellOf(viewer)} />;
}
