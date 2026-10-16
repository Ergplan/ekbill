import { notFound, redirect } from 'next/navigation';

import { loadCreditNote } from '../../../../screens/credit-note/data';
import { CreditNoteScreen } from '../../../../screens/credit-note/Screen';
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
  const { number } = await params;
  const data = await loadCreditNote(viewer, number);
  if (data === 'forbidden') redirect('/');
  if (!data) notFound();
  return <CreditNoteScreen bill={data} viewer={shellOf(viewer)} />;
}
