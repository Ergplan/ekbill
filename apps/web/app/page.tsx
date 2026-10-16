import { loadHome } from '../screens/home/data';
import { HomeScreen } from '../screens/home/Screen';
import { getViewer, shellOf, type SearchParams } from '../screens/viewer';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer(await searchParams);
  return <HomeScreen data={await loadHome(viewer)} viewer={shellOf(viewer)} />;
}
