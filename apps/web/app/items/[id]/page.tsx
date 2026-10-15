import { notFound, redirect } from 'next/navigation';

import { ItemScreen } from '../../../screens/item/Screen';
import { TODAY } from '../../../screens/fixtures';
import { loadItem } from '../../../screens/items/data';
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
  const item = id === 'new' ? null : loadItem(viewer, id);
  if (id !== 'new' && !item) notFound();
  return <ItemScreen item={item} registration={b.registration} today={TODAY} viewer={shellOf(viewer)} />;
}
