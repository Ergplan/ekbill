import { redirect } from 'next/navigation';

import { FIXTURE } from '../../screens/fixtures';
import { HelpScreen } from '../../screens/help/Screen';
import { getViewer, shellOf, type SearchParams } from '../../screens/viewer';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer(await searchParams);
  if (!viewer.business || viewer.role === 'accountant') redirect('/');
  return <HelpScreen help={FIXTURE.help} viewer={shellOf(viewer)} />;
}
