import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { loadPlan } from '../../../screens/plan/data';
import { PlanScreen } from '../../../screens/plan/Screen';
import { getViewer, shellOf, type SearchParams } from '../../../screens/viewer';

export const dynamic = 'force-dynamic';

/** Aapka plan (20 Oct): every member sees it; the owner pays. The referral link is built on the host asked for. */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer(await searchParams);
  if (!viewer.business) redirect('/aap');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto =
    h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  const data = await loadPlan(viewer, `${proto}://${host}`);
  return <PlanScreen data={data} viewer={shellOf(viewer)} />;
}
