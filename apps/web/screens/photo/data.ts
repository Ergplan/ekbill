import { NotFoundError, customers, photos } from '@ekbill/db';
import type { CheckedReading, ReadField as EngineField, Registration } from '@ekbill/engine';

import { FIXTURE, TODAY, type PhotoReview, type ReadField } from '../fixtures';
import { scopeOf, todayOf } from '../live';
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
  /** A real reading (Stage 7); null for a look at the prototype. */
  live: LiveReading | null;
}

export interface LiveReading {
  extractionId: string;
  /** Where the screen stands: the worker still reading, the review, or why it could not. */
  state: 'reading' | 'review' | 'unclear' | 'notfound' | 'unavailable';
  committedDocumentId: string | null;
  match: { customerId: string; name: string; score: number; stateCode: string | null } | null;
  warnings: CheckedReading['warnings'];
  imageTotalPaise: number | null;
  linesTotalPaise: number;
  totalsDiffer: boolean;
  /** The reading as the model gave it, for the corrections (field → value). */
  modelValues: Record<string, string | null>;
}

const asField = (f: EngineField | undefined): ReadField => ({
  value: f?.value ?? '',
  confidence: f?.confidence ?? 0,
  unreadable: f?.unreadable ?? false,
});

function businessOf(viewer: Viewer): PhotoData['business'] | null {
  const b = viewer.business;
  if (!b) return null;
  const series = b.series[0] ?? { prefix: 'INV', next: 1 };
  return {
    name: b.name,
    registration: b.registration,
    stateCode: b.stateCode,
    gstin: b.gstin,
    upi: b.upi,
    address: [b.address, b.city].filter(Boolean).join(', '),
    defaultRate: b.gstDefaultRate ?? 18,
    nextNumber: `${series.prefix.replace(/[-/]+$/, '')}-${String(series.next).padStart(3, '0')}`,
  };
}

/** The photographed bill: the fixture's for a look, the worker's reading for a session (Stage 7). */
export async function loadPhoto(viewer: Viewer, extractionId: string | null): Promise<PhotoData | null> {
  const business = businessOf(viewer);
  if (!business) return null;
  const scope = scopeOf(viewer);
  if (!scope || !extractionId)
    return { review: FIXTURE.photoReview, business, today: scope ? todayOf(viewer) : TODAY, live: null };
  let row;
  try {
    row = await photos.getExtraction(scope, extractionId);
  } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
  const result = row.result as CheckedReading | null;
  const state: LiveReading['state'] =
    row.status === 'pending'
      ? 'reading'
      : row.status === 'failed'
        ? row.error === 'unreadable'
          ? 'unclear'
          : row.error === 'no-bill'
            ? 'notfound'
            : 'unavailable'
        : 'review';
  const matched =
    result?.match && row.matchedCustomerId
      ? await customers.getCustomer(scope, row.matchedCustomerId).catch(() => null)
      : null;
  const lines = result?.lines ?? [];
  const modelValues: Record<string, string | null> = {
    customer: result?.customer.value ?? null,
    date: result?.date.value ?? null,
  };
  lines.forEach((l, i) => {
    modelValues[`lines.${i}.what`] = l.what.value;
    modelValues[`lines.${i}.qty`] = l.qty.value;
    modelValues[`lines.${i}.rate`] = l.rate.value;
  });
  return {
    review: {
      customer: row.matchedCustomerId ?? '',
      photo: `/api/extractions/${row.id}/image`,
      readAt: row.updatedAt.toISOString(),
      fields: {
        customer: asField(result?.customer),
        date: asField(result?.date),
        lines: lines.map((l) => ({ what: asField(l.what), qty: asField(l.qty), rate: asField(l.rate) })),
        total: {
          value:
            result?.imageTotalPaise !== null && result?.imageTotalPaise !== undefined
              ? String(result.imageTotalPaise / 100)
              : '',
          confidence: 1,
        },
      },
    },
    business,
    today: todayOf(viewer),
    live: {
      extractionId: row.id,
      state,
      committedDocumentId: row.committedDocumentId,
      match:
        result?.match && matched
          ? { customerId: matched.id, name: matched.name, score: result.match.score, stateCode: matched.stateCode }
          : null,
      warnings: result?.warnings ?? [],
      imageTotalPaise: result?.imageTotalPaise ?? null,
      linesTotalPaise: result?.linesTotalPaise ?? 0,
      totalsDiffer: result?.totalsDiffer ?? false,
      modelValues,
    },
  };
}
