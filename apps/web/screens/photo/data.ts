import type { Registration } from '@ekbill/engine';

import { FIXTURE, TODAY, type PhotoReview } from '../fixtures';
import type { Viewer } from '../viewer';

export interface PhotoData {
  review: PhotoReview;
  business: {
    name: string;
    registration: Registration;
    stateCode: string | null;
    gstin: string | null;
    upi: string | null;
    address: string | null;
    defaultRate: number;
    nextNumber: string;
  };
  today: string;
}

/** The fixture's photographed bill (Stage 7 replaces it with the model's reading) and the business the bill will carry. */
export function loadPhoto(viewer: Viewer): PhotoData | null {
  const b = viewer.business;
  if (!b) return null;
  const series = b.series[0] ?? { prefix: 'INV', next: 1 };
  return {
    review: FIXTURE.photoReview,
    business: {
      name: b.name,
      registration: b.registration,
      stateCode: b.stateCode,
      gstin: b.gstin,
      upi: b.upi,
      address: [b.address, b.city].filter(Boolean).join(', '),
      defaultRate: b.gstDefaultRate ?? 18,
      nextNumber: `${series.prefix}-${String(series.next).padStart(3, '0')}`,
    },
    today: TODAY,
  };
}
