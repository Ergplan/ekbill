import { notFound } from 'next/navigation';

import { loadGstDrill } from '../../../screens/gst/data';
import { GstDrillScreen } from '../../../screens/gst/Drill';
import { getViewer, one, shellOf, type SearchParams } from '../../../screens/viewer';

export const dynamic = 'force-dynamic';

/** The documents behind one figure on /gst: ?from=YYYY-MM&to=YYYY-MM&table=rate|b2b|b2c|cdn[&rate=1800]. */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const viewer = await getViewer(sp);
  const data = await loadGstDrill(viewer, {
    from: one(sp.from),
    to: one(sp.to),
    table: one(sp.table),
    rate: one(sp.rate),
  });
  if (!data) notFound();
  return <GstDrillScreen data={data} viewer={shellOf(viewer)} />;
}
