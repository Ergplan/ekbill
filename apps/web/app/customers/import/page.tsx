import { redirect } from 'next/navigation';

import { FIXTURE } from '../../../screens/fixtures';
import { ImportScreen } from '../../../screens/import/Screen';
import { getViewer, one, shellOf, type SearchParams } from '../../../screens/viewer';

export const dynamic = 'force-dynamic';
const STATES = ['pick', 'reading', 'rows', 'done'] as const;

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const viewer = await getViewer(sp);
  if (!viewer.business || viewer.role === 'accountant') redirect('/');
  const raw = one(sp.state) as (typeof STATES)[number] | null;
  const state = raw && STATES.includes(raw) ? raw : 'pick';
  return <ImportScreen state={state} preview={FIXTURE.importPreview} viewer={shellOf(viewer)} />;
}
