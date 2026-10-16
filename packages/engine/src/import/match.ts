import { nameKey } from '../names';
import type { ImportedCustomer } from './types';

/**
 * Who among the business's customers an imported one already is ("Pehle se
 * hai"): the same GSTIN, else the same last ten digits of the phone, else
 * the same name once punctuation and case are set aside. Salvaged from the
 * MVP's import route (matchExisting, dedupeWithin; tag mvp-final).
 */
export interface ExistingCustomer {
  id: string;
  name: string;
  gstin: string | null;
  phone: string | null;
}

export const normaliseName = nameKey;
const lastTen = (p: string | null | undefined) => (p ?? '').replace(/\D/g, '').slice(-10);

export function matchExisting(
  c: Pick<ImportedCustomer, 'name' | 'gstin' | 'phone'>,
  existing: readonly ExistingCustomer[],
): string | null {
  // The strongest identifier first across everyone, then the next (Stage 5 review: by row order, a same-named
  // customer listed earlier won over the one with the same GSTIN).
  const phone = lastTen(c.phone);
  const name = normaliseName(c.name);
  const byGstin = c.gstin ? existing.find((e) => e.gstin === c.gstin) : undefined;
  const byPhone = phone.length === 10 ? existing.find((e) => lastTen(e.phone) === phone) : undefined;
  const byName = name ? existing.find((e) => normaliseName(e.name) === name) : undefined;
  return (byGstin ?? byPhone ?? byName)?.id ?? null;
}

/** One row per customer within a reading: the same GSTIN, or the same name, twice is once. */
export function dedupeWithin<T extends Pick<ImportedCustomer, 'name' | 'gstin'>>(customers: readonly T[]): T[] {
  const seen = new Set<string>();
  return customers.filter((c) => {
    const key = c.gstin ?? normaliseName(c.name);
    if (!key) return true; // a name with nothing comparable in it is never "the same" as another
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
