import { redirect } from 'next/navigation';

import { customerOf } from '../../../screens/common';
import { CustomerNewScreen } from '../../../screens/customer-new/Screen';
import { getViewer, one, shellOf, type SearchParams } from '../../../screens/viewer';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const viewer = await getViewer(sp);
  if (!viewer.business || viewer.role === 'accountant') redirect('/');
  const edit = one(sp.edit);
  const c = edit ? customerOf(viewer.business, edit) : null;
  return (
    <CustomerNewScreen
      viewer={shellOf(viewer)}
      initial={c ? { name: c.name, phone: c.phone ?? '', gstin: c.gstin ?? '', lang: c.lang } : null}
    />
  );
}
