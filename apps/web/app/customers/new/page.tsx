import { redirect } from 'next/navigation';

import { CustomerNewScreen } from '../../../screens/customer-new/Screen';
import { loadCustomerNew } from '../../../screens/customer-new/data';
import { getViewer, one, shellOf, type SearchParams } from '../../../screens/viewer';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const viewer = await getViewer(sp);
  if (!viewer.business || viewer.role === 'accountant') redirect('/');
  return <CustomerNewScreen viewer={shellOf(viewer)} initial={loadCustomerNew(viewer, one(sp.edit))} />;
}
