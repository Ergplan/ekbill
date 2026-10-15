import { notFound, redirect } from 'next/navigation';

import { billOf, customerOf } from '../../../../screens/common';
import { CreditNoteScreen } from '../../../../screens/credit-note/Screen';
import { FIXTURE } from '../../../../screens/fixtures';
import { getViewer, shellOf, type SearchParams } from '../../../../screens/viewer';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ number: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const viewer = await getViewer(await searchParams);
  const b = viewer.business;
  if (!b || viewer.role !== 'owner') redirect('/');
  const { number } = await params;
  const bill = billOf(b, number);
  if (!bill) notFound();
  const next = `CN-${String(FIXTURE.creditNotes.filter((c) => c.business === b.id).length + 1).padStart(3, '0')}`;
  return (
    <CreditNoteScreen
      bill={{
        number: bill.number,
        customerName: customerOf(b, bill.customer)?.name ?? '',
        totalPaise: bill.totalPaise,
        nextNumber: next,
      }}
      viewer={shellOf(viewer)}
    />
  );
}
