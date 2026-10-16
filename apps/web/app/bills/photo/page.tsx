import { notFound, redirect } from 'next/navigation';

import { scopeOf } from '../../../screens/live';
import { loadPhoto } from '../../../screens/photo/data';
import { PhotoScreen, type PhotoState } from '../../../screens/photo/Screen';
import { getViewer, one, shellOf, type SearchParams } from '../../../screens/viewer';

export const dynamic = 'force-dynamic';
const STATES: PhotoState[] = ['pick', 'reading', 'review', 'unclear', 'notfound', 'unavailable'];

/**
 * A session's reading is found by ?id= (Stage 7): its state is the worker's.
 * A look walks the prototype's states by ?state=.
 */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const viewer = await getViewer(sp);
  if (viewer.role === 'accountant') redirect('/');
  const id = one(sp.id);
  const data = await loadPhoto(viewer, id);
  if (!data) {
    if (id) notFound();
    redirect('/');
  }
  if (data.live?.committedDocumentId) redirect(`/bills/new/done?id=${data.live.committedDocumentId}`);
  const raw = one(sp.state);
  const state = data.live ? data.live.state : STATES.includes(raw as PhotoState) ? (raw as PhotoState) : 'pick';
  return (
    // Keyed by the reading and its state: the review starts from the reading, never from a screen shown before it.
    <PhotoScreen
      key={`${data.live?.extractionId ?? 'prototype'}:${state}`}
      state={state}
      review={data.review}
      business={data.business}
      today={data.today}
      live={data.live}
      sendsPhotos={Boolean(scopeOf(viewer))}
      viewer={shellOf(viewer)}
    />
  );
}
