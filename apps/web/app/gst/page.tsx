import { redirect } from 'next/navigation';

import { loadGst } from '../../screens/gst/data';
import { GstScreen } from '../../screens/gst/Screen';
import { getViewer, one, shellOf, type SearchParams } from '../../screens/viewer';

export const dynamic = 'force-dynamic';

/** Composition and unregistered businesses have no GST tab and no /gst (8.0). */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const viewer = await getViewer(sp);
  const data = await loadGst(viewer, { period: one(sp.period), q: one(sp.q) });
  if (!data) redirect('/');
  return <GstScreen data={data} viewer={shellOf(viewer)} />;
}
