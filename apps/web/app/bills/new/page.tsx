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
  const data = await loadBillForm(viewer, {
    customer,
    first,
    newCustomer,
    state: one(sp.state),
    name: one(sp.name),
    redo: one(sp.redo),
  });
  if (!first && !newCustomer && !data.customer) return <BillStartScreen pick={data.pick} viewer={shellOf(viewer)} />;
  // One form per bill asked for: a move to another customer's form (the voice from an open form, a chip) starts
  // that form afresh, with what was handed over to it, rather than keeping the last one's state.
  const key = [
    customer ?? '',
    newCustomer ? 'new' : '',
    first ? 'first' : '',
    one(sp.redo) ?? '',
    one(sp.name) ?? '',
  ].join('|');
  return <BillScreen key={key} data={data} viewer={shellOf(viewer)} />;
}
