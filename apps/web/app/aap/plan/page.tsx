import { redirect } from 'next/navigation';

import { loadPlan } from '../../../screens/plan/data';
import { PlanScreen } from '../../../screens/plan/Screen';
import { getViewer, shellOf, type SearchParams } from '../../../screens/viewer';
import { requestOrigin } from '../../../server/origin';

export const dynamic = 'force-dynamic';

/** Aapka plan (20 Oct): every member sees it; the owner pays. The referral link is built on the host asked for. */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer(await searchParams);
  if (!viewer.business) redirect('/aap');
  const data = await loadPlan(viewer, await requestOrigin());
  return <PlanScreen data={data} viewer={shellOf(viewer)} />;
}
