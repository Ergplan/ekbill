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

export const normaliseName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(sample\)/g, '')
    .replace(/[^a-z0-9]/g, '');
const lastTen = (p: string | null | undefined) => (p ?? '').replace(/\D/g, '').slice(-10);

export function matchExisting(
  c: Pick<ImportedCustomer, 'name' | 'gstin' | 'phone'>,
  existing: readonly ExistingCustomer[],
): string | null {
  const phone = lastTen(c.phone);
  for (const e of existing) {
    if (c.gstin && e.gstin && c.gstin === e.gstin) return e.id;
    if (phone.length === 10 && lastTen(e.phone) === phone) return e.id;
    if (normaliseName(e.name) && normaliseName(e.name) === normaliseName(c.name)) return e.id;
  }
  return null;
}

/** One row per customer within a reading: the same GSTIN, or the same name, twice is once. */
export function dedupeWithin<T extends Pick<ImportedCustomer, 'name' | 'gstin'>>(customers: readonly T[]): T[] {
  const seen = new Set<string>();
  return customers.filter((c) => {
    const key = c.gstin ?? normaliseName(c.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
