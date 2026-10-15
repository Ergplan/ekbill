import { redirect } from 'next/navigation';

import { loadItems } from '../../screens/items/data';
import { ItemsScreen } from '../../screens/items/Screen';
import { getViewer, shellOf, type SearchParams } from '../../screens/viewer';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer(await searchParams);
  if (!viewer.business) redirect('/');
  return <ItemsScreen items={loadItems(viewer)} viewer={shellOf(viewer)} />;
}
