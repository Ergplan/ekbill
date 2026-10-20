import { notFound, redirect } from 'next/navigation';

import { loadBillDone, loadIssued } from '../../../../screens/bill-done/data';
import { BillDoneScreen } from '../../../../screens/bill-done/Screen';
import { getViewer, one, shellOf, type SearchParams } from '../../../../screens/viewer';
import { requestOrigin } from '../../../../server/origin';

export const dynamic = 'force-dynamic';

/**
 * A session lands here with the issued bill's id (Stage 6): the paper from
 * its snapshot and the real file to share. A look (?as=) renders the draft
 * from sessionStorage, with the loader's fallback paper for the screenshots.
 */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const viewer = await getViewer(sp);
  const id = one(sp.id);
  if (id) {
    const issued = await loadIssued(viewer, id, await requestOrigin());
    if (!issued) notFound();
    return (
      <BillDoneScreen fallback={issued.fallback} share={issued.share} live={issued.live} viewer={shellOf(viewer)} />
    );
  }
  const data = loadBillDone(viewer);
  if (!data) redirect('/');
  return <BillDoneScreen fallback={data.fallback} share={data.share} live={null} viewer={shellOf(viewer)} />;
}
