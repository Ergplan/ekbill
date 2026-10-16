import { notFound, redirect } from 'next/navigation';

import { loadRemind } from '../../../../screens/remind/data';
import { RemindScreen } from '../../../../screens/remind/Screen';
import { getViewer, shellOf, type SearchParams } from '../../../../screens/viewer';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ number: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const viewer = await getViewer(await searchParams);
  if (!viewer.business || viewer.role === 'accountant') redirect('/');
  const { number } = await params;
  const data = await loadRemind(viewer, number);
  if (!data) notFound();
  return <RemindScreen data={data} viewer={shellOf(viewer)} />;
}
