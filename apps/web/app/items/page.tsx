import { redirect } from 'next/navigation';

import { FIXTURE } from '../../screens/fixtures';
import { ItemsScreen } from '../../screens/items/Screen';
import { getViewer, shellOf, type SearchParams } from '../../screens/viewer';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer(await searchParams);
  const b = viewer.business;
  if (!b) redirect('/');
  return <ItemsScreen items={FIXTURE.items.filter((i) => i.business === b.id)} viewer={shellOf(viewer)} />;
}
