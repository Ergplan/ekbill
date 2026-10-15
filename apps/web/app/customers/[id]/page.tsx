import { notFound, redirect } from 'next/navigation';

import { loadCustomer } from '../../../screens/customer/data';
import { CustomerScreen } from '../../../screens/customer/Screen';
import { getViewer, shellOf, type SearchParams } from '../../../screens/viewer';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const viewer = await getViewer(await searchParams);
  if (!viewer.business) redirect('/');
  const { id } = await params;
  const data = loadCustomer(viewer, id);
  if (!data) notFound();
  return <CustomerScreen data={data} viewer={shellOf(viewer)} />;
}
