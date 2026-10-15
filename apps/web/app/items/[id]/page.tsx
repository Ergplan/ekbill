import { notFound, redirect } from 'next/navigation';

import { FIXTURE } from '../../../screens/fixtures';
import { ItemScreen } from '../../../screens/item/Screen';
import { getViewer, shellOf, type SearchParams } from '../../../screens/viewer';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const viewer = await getViewer(await searchParams);
  const b = viewer.business;
  if (!b) redirect('/');
  const { id } = await params;
  const item = id === 'new' ? null : (FIXTURE.items.find((i) => i.business === b.id && i.id === id) ?? null);
  if (id !== 'new' && !item) notFound();
  return <ItemScreen item={item} registration={b.registration} viewer={shellOf(viewer)} />;
}
