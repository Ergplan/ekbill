import { redirect } from 'next/navigation';

import { loadBillForm } from '../../../screens/bill/data';
import { BillScreen } from '../../../screens/bill/Screen';
import { BillStartScreen } from '../../../screens/bill-start/Screen';
import { getViewer, one, shellOf, type SearchParams } from '../../../screens/viewer';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const viewer = await getViewer(sp);
  if (viewer.role === 'accountant') redirect('/');
  const first = one(sp.first) === '1' || !viewer.business;
  const customer = one(sp.customer);
  const newCustomer = one(sp.new) === '1';
  const data = loadBillForm(viewer, { customer, first, newCustomer, state: one(sp.state) });
  if (!first && !newCustomer && !data.customer) return <BillStartScreen pick={data.pick} viewer={shellOf(viewer)} />;
  return <BillScreen data={data} viewer={shellOf(viewer)} />;
}
