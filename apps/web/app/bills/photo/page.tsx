import { redirect } from 'next/navigation';

import { FIXTURE, TODAY } from '../../../screens/fixtures';
import { PhotoScreen, type PhotoState } from '../../../screens/photo/Screen';
import { getViewer, one, shellOf, type SearchParams } from '../../../screens/viewer';

export const dynamic = 'force-dynamic';
const STATES: PhotoState[] = ['pick', 'reading', 'review', 'unclear', 'notfound'];

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const viewer = await getViewer(sp);
  const b = viewer.business;
  if (!b || viewer.role === 'accountant') redirect('/');
  const raw = one(sp.state);
  const state = STATES.includes(raw as PhotoState) ? (raw as PhotoState) : 'pick';
  const series = b.series[0] ?? { prefix: 'INV', next: 1 };
  return (
    <PhotoScreen
      state={state}
      review={FIXTURE.photoReview}
      business={{
        name: b.name,
        registration: b.registration,
        stateCode: b.stateCode,
        gstin: b.gstin,
        upi: b.upi,
        address: `${b.address ?? ''}, ${b.city ?? ''}`,
        defaultRate: b.gstDefaultRate ?? 18,
        nextNumber: `${series.prefix}-${String(series.next).padStart(3, '0')}`,
      }}
      today={TODAY}
      viewer={shellOf(viewer)}
    />
  );
}
