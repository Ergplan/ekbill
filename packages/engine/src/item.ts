import { HSN_INDEX, selectableRates } from './rules';
import { say, type Say } from './say';

/**
 * Kaam and saamaan the business bills for: name, HSN or SAC, unit, rate,
 * GST rate. Checked the same way in the browser and on the server, and a
 * lookup over the chapter-level HSN and SAC headings in the pack
 * (hsn-index.json) for the owner who does not know the code.
 */
export const ITEM_UNITS = [
  'nos',
  'kg',
  'g',
  'l',
  'ml',
  'm',
  'sqft',
  'box',
  'pack',
  'set',
  'pair',
  'hour',
  'day',
  'visit',
  'job',
] as const;

export interface ItemInput {
  name: string;
  description?: string | null;
  hsnSac?: string | null;
  unit?: string | null;
  defaultRatePaise?: number | null;
  /** Basis points: 1800 for 18 %. Null: the bill's rate applies. */
  defaultTaxBp?: number | null;
  priceIncludesTax?: boolean | null;
}
export type ItemField = keyof ItemInput;
export interface ItemClean {
  name: string;
  description: string | null;
  hsnSac: string | null;
  unit: string | null;
  defaultRatePaise: number | null;
  defaultTaxBp: number | null;
  priceIncludesTax: boolean;
}
export type ItemCheck = { ok: true; item: ItemClean } | { ok: false; field: ItemField; message: Say };

/** HSN is 2, 4, 6 or 8 digits; SAC is 6 digits starting 99 (hsn-digits-2021). */
export function isHsnSac(code: string): boolean {
  if (/^99\d{4}$/.test(code)) return true;
  return /^\d{2}(?:\d{2}){0,3}$/.test(code) && !code.startsWith('99');
}

export function checkItem(input: ItemInput, today: string): ItemCheck {
  const fail = (field: ItemField, key: string, params?: Record<string, string | number>): ItemCheck => ({
    ok: false,
    field,
    message: say(key, params),
  });
  const name = (input.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return fail('name', 'error.required');
  if (name.length > 120) return fail('name', 'error.tooLong', { n: 120 });
  const hsnSac = (input.hsnSac ?? '').replace(/\s/g, '') || null;
  if (hsnSac && !isHsnSac(hsnSac)) return fail('hsnSac', 'error.hsn');
  const unit = (input.unit ?? '').trim().toLowerCase() || null;
  if (unit && unit.length > 12) return fail('unit', 'error.tooLong', { n: 12 });
  const rate = input.defaultRatePaise ?? null;
  if (rate !== null && (!Number.isSafeInteger(rate) || rate < 0)) return fail('defaultRatePaise', 'error.amount');
  const bp = input.defaultTaxBp ?? null;
  if (bp !== null) {
    const allowed = selectableRates(today).map((r) => Math.round(r * 100));
    if (!allowed.includes(bp)) return fail('defaultTaxBp', 'error.rate', { rates: selectableRates(today).join(', ') });
  }
  const description = (input.description ?? '').trim() || null;
  if (description && description.length > 300) return fail('description', 'error.tooLong', { n: 300 });
  return {
    ok: true,
    item: {
      name,
      description,
      hsnSac,
      unit,
      defaultRatePaise: rate,
      defaultTaxBp: bp,
      priceIncludesTax: input.priceIncludesTax ?? false,
    },
  };
}

export interface HsnHit {
  code: string;
  heading: string;
  kind: 'hsn' | 'sac';
}

/**
 * The headings that match what the owner typed: a code prefix ("99", "8516")
 * or words in the heading ("electrical", "repair"). Chapter-level only; the
 * owner extends the digits the bill needs (hsn-digits-2021).
 */
export function lookupHsnSac(query: string, limit = 8): HsnHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all: HsnHit[] = [
    ...HSN_INDEX.sacHeadings.map((s) => ({ code: s.code, heading: s.heading, kind: 'sac' as const })),
    ...HSN_INDEX.hsnChapters.map((h) => ({ code: h.chapter, heading: h.heading, kind: 'hsn' as const })),
  ];
  if (/^\d+$/.test(q)) {
    return all.filter((h) => q.startsWith(h.code) || h.code.startsWith(q)).slice(0, limit);
  }
  const words = q.split(/\s+/).filter((w) => w.length > 1);
  return all
    .map((h) => ({ h, score: words.filter((w) => h.heading.toLowerCase().includes(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.h.code.localeCompare(b.h.code))
    .slice(0, limit)
    .map((x) => x.h);
}
