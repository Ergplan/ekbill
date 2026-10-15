import { redirect } from 'next/navigation';

import { loadCustomerNew } from '../../../screens/customer-new/data';
import { CustomerNewScreen } from '../../../screens/customer-new/Screen';
import { getViewer, one, shellOf, type SearchParams } from '../../../screens/viewer';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const viewer = await getViewer(sp);
  const data = loadCustomerNew(viewer, { edit: one(sp.edit) });
  if (!data) redirect('/');
  return <CustomerNewScreen viewer={shellOf(viewer)} initial={data.initial} />;
}
