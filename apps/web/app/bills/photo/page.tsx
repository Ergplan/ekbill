import { redirect } from 'next/navigation';

import { loadPhoto } from '../../../screens/photo/data';
import { PhotoScreen, type PhotoState } from '../../../screens/photo/Screen';
import { getViewer, one, shellOf, type SearchParams } from '../../../screens/viewer';

export const dynamic = 'force-dynamic';
const STATES: PhotoState[] = ['pick', 'reading', 'review', 'unclear', 'notfound'];

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const viewer = await getViewer(sp);
  const data = loadPhoto(viewer);
  if (!data || viewer.role === 'accountant') redirect('/');
  const raw = one(sp.state);
  const state = STATES.includes(raw as PhotoState) ? (raw as PhotoState) : 'pick';
  return (
    <PhotoScreen
      state={state}
      review={data.review}
      business={data.business}
      today={data.today}
      viewer={shellOf(viewer)}
    />
  );
}
