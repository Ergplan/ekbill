import { redirect } from 'next/navigation';

import { loadHelp } from '../../screens/help/data';
import type { HelpKind } from '../../screens/help/plan';
import { HelpScreen } from '../../screens/help/Screen';
import { getViewer, one, shellOf, type SearchParams } from '../../screens/viewer';

export const dynamic = 'force-dynamic';

const KINDS: HelpKind[] = ['percent', 'instalments', 'running'];

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const viewer = await getViewer(sp);
  const data = await loadHelp(viewer);
  if (!data) redirect('/');
  const asked = one(sp.kind);
  const kind = KINDS.find((k) => k === asked) ?? null;
  return <HelpScreen key={kind ?? 'choose'} data={data} kind={kind} viewer={shellOf(viewer)} />;
}
