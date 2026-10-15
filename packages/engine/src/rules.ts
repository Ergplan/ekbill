import pack from '../rules/gst/rates.json';
import { findState } from './state-codes';

/**
 * The GST rule pack (I5): versioned, sourced JSON selected by document date.
 * The engine never embeds a rate, a document kind or a place-of-supply
 * decision; it asks the pack for the date the document carries. Stage 3
 * verifies the entries and adds the rest (HSN digits, thresholds,
 * composition limits, the return calendar).
 */
export type RuleKind = 'selectable-rates' | 'place-of-supply' | 'document-kinds';
export interface RuleEntry {
  id: string;
  kind: RuleKind;
  effectiveFrom: string;
  effectiveTo: string | null;
  ratesPercent?: number[];
  rule?: string;
  kinds?: Record<string, 'tax-invoice' | 'bill-of-supply' | 'invoice'>;
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

export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleError';
  }
}

export function ruleOn(kind: RuleKind, dateIso: string, rules: RulePack = GST_RULES): RuleEntry | null {
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
export type StateHead = 'SGST' | 'UTGST';
export interface SupplyDecision {
  supply: Supply;
  /** Within the state: SGST, or UTGST in a Union Territory without a legislature. */
  stateHead: StateHead;
  ruleId: string;
}

/**
 * Where the supply is taxed, for a document dated `dateIso`: the same State
 * or UT as the supplier means CGST plus the state head, another State means
 * IGST. An unknown customer state counts as intra until the check asks for
 * it. Throws when the pack has no place-of-supply rule for the date.
 */
export function placeOfSupply(
  sellerStateCode: string | null,
  customerStateCode: string | null,
  dateIso: string,
  rules: RulePack = GST_RULES,
): SupplyDecision {
  const rule = ruleOn('place-of-supply', dateIso, rules);
  if (!rule) throw new RuleError(`no place-of-supply rule for ${dateIso}`);
  const supply: Supply =
    !sellerStateCode || !customerStateCode || sellerStateCode === customerStateCode ? 'intra' : 'inter';
  const seller = findState(sellerStateCode);
  return { supply, stateHead: seller?.taxAuthority === 'UTGST' ? 'UTGST' : 'SGST', ruleId: rule.id };
}

/** Kept for callers that only need the intra/inter answer; the engine itself takes the full decision. */
export function supplyKind(
  sellerStateCode: string | null,
  customerStateCode: string | null,
  dateIso: string,
  rules: RulePack = GST_RULES,
): Supply {
  return placeOfSupply(sellerStateCode, customerStateCode, dateIso, rules).supply;
}

export type DocumentKind = 'tax-invoice' | 'bill-of-supply' | 'invoice';

/** The document a business issues on `dateIso`, from the pack: tax invoice, bill of supply or a plain invoice. */
export function documentKind(
  registration: 'regular' | 'composition' | 'unregistered' | 'unknown',
  gstOn: boolean,
  dateIso: string,
  rules: RulePack = GST_RULES,
): DocumentKind {
  const rule = ruleOn('document-kinds', dateIso, rules);
  if (!rule?.kinds) throw new RuleError(`no document-kinds rule for ${dateIso}`);
  const key = registration === 'regular' && !gstOn ? 'regular-gst-off' : registration;
  const kind = rule.kinds[key];
  if (!kind) throw new RuleError(`document-kinds rule ${rule.id} has no entry for ${key}`);
  return kind;
}
