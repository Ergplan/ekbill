import pack from '../rules/gst/rates.json';

/**
 * The GST rule pack (I5): versioned, sourced JSON selected by document date.
 * The engine never embeds a rate; screens and documents ask the pack for
 * the date they carry. Stage 3 verifies the entries and adds the rest
 * (document types, HSN digits, thresholds, composition, return calendar).
 */
export interface RuleEntry {
  id: string;
  kind: 'selectable-rates' | 'place-of-supply';
  effectiveFrom: string;
  effectiveTo: string | null;
  ratesPercent?: number[];
  rule?: string;
  source: string;
  verified: boolean;
  verifiedOn: string | null;
  verifiedBy: string | null;
}
export interface RulePack {
  version: string;
  effectiveFrom: string;
  entries: RuleEntry[];
}

export const GST_RULES: RulePack = pack as RulePack;

export function ruleOn(kind: RuleEntry['kind'], dateIso: string, rules: RulePack = GST_RULES): RuleEntry | null {
  const date = dateIso.slice(0, 10);
  const matches = rules.entries
    .filter((e) => e.kind === kind && e.effectiveFrom <= date && (e.effectiveTo === null || date <= e.effectiveTo))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return matches[0] ?? null;
}

/** The GST rates a bill dated `dateIso` may carry, in percent. Empty when the pack has no entry for that date. */
export function selectableRates(dateIso: string, rules: RulePack = GST_RULES): number[] {
  return ruleOn('selectable-rates', dateIso, rules)?.ratesPercent ?? [];
}

export type Supply = 'intra' | 'inter';

/** Same State (or UT) as the supplier: CGST + SGST; otherwise IGST. Unknown customer state counts as intra until the check asks. */
export function supplyKind(sellerStateCode: string | null, customerStateCode: string | null): Supply {
  if (!sellerStateCode || !customerStateCode) return 'intra';
  return sellerStateCode === customerStateCode ? 'intra' : 'inter';
}
