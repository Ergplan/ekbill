import { redirect } from 'next/navigation';

import { loadCustomers } from '../../screens/customers/data';
import { CustomersScreen } from '../../screens/customers/Screen';
import { getViewer, shellOf, type SearchParams } from '../../screens/viewer';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer(await searchParams);
  if (!viewer.business) redirect('/');
  return <CustomersScreen rows={await loadCustomers(viewer)} viewer={shellOf(viewer)} />;
}
