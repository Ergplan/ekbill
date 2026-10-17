import compositionPack from '../rules/gst/composition.json';
import creditNotePack from '../rules/gst/credit-note-limits.json';
import documentTypesPack from '../rules/gst/document-types.json';
import eInvoicePack from '../rules/gst/e-invoice.json';
import hsnIndex from '../rules/gst/hsn-index.json';
import hsnPack from '../rules/gst/hsn.json';
import placeOfSupplyPack from '../rules/gst/place-of-supply.json';
import ratesPack from '../rules/gst/rates.json';
import returnsPack from '../rules/gst/returns-calendar.json';
import { findState } from './state-codes';

/**
 * The GST rule pack (I5): versioned, sourced JSON in ../rules/gst, selected
 * by document date. The engine never embeds a rate, a threshold, a document
 * kind, a due day or a place-of-supply decision; it asks the pack for the
 * date the document carries, and names the entries it used (rulesApplied)
 * so a snapshot records them. explain(ruleId) gives the two-register text
 * the screens show. rules:check holds every file to ../rules/schema.ts.
 */
export type RuleKind =
  | 'selectable-rates'
  | 'note'
  | 'document-kinds'
  | 'document-fields'
  | 'threshold'
  | 'hsn-digits'
  | 'reporting-window'
  | 'composition'
  | 'place-of-supply'
  | 'place-of-supply-cases'
  | 'due-date'
  | 'portal-lock'
  | 'deadline';
export type Supply = 'intra' | 'inter';
export type DocumentKind = 'tax-invoice' | 'bill-of-supply' | 'invoice';
export type StateHead = 'SGST' | 'UTGST';

export interface RuleEntry {
  id: string;
  kind: RuleKind;
  effectiveFrom: string;
  effectiveTo: string | null;
  source: string;
  explain: { en: string; 'hi-Latn': string };
  verified: boolean;
  verifiedOn: string;
  verifiedBy: string;
  // kind-specific (the schema checks them; the accessors below narrow)
  ratesPercent?: number[];
  specialRatesPercent?: number[];
  kinds?: Record<string, DocumentKind>;
  decide?: { sameState: Supply; otherState: Supply; unknownState: Supply };
  thresholdPaise?: number;
  applies?: string;
  exemptions?: string[];
  days?: number;
  bands?: Array<{ turnoverUpToPaise: number | null; b2bDigits: number; b2cDigits: number }>;
  sacDigits?: number;
  sacPrefix?: string;
  goodsLimitPaise?: number;
  specialStatesLimitPaise?: number;
  servicesLimitPaise?: number;
  specialStates?: string[];
  canCollectTax?: boolean;
  legend?: string;
  compositionLegend?: string;
  maxNumberLength?: number;
  form?: 'GSTR-1' | 'GSTR-3B';
  frequency?: 'monthly' | 'quarterly';
  dayOfNextMonth?: number;
  dayAfterQuarterEnd?: number;
  dayAfterQuarterEndGroupA?: number;
  groupAStates?: string[];
  iffDayOfNextMonth?: number;
  monthDay?: string;
  yearsAfterFinancialYear?: number;
  orAnnualReturn?: boolean;
  document?: string;
  requires?: string[];
  cases?: Record<string, string>;
  locks?: string[];
  years?: number;
}
export interface RulePack {
  version: string;
  files: Record<string, string>;
  entries: RuleEntry[];
}

export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleError';
  }
}

const FILES = {
  'rates.json': ratesPack,
  'document-types.json': documentTypesPack,
  'hsn.json': hsnPack,
  'e-invoice.json': eInvoicePack,
  'composition.json': compositionPack,
  'place-of-supply.json': placeOfSupplyPack,
  'returns-calendar.json': returnsPack,
  'credit-note-limits.json': creditNotePack,
} as const;

/** The whole pack, every file's entries together; the version is the newest file version. */
export const GST_RULES: RulePack = {
  version: Object.values(FILES)
    .map((f) => f.version)
    .sort()
    .at(-1)!,
  files: Object.fromEntries(Object.entries(FILES).map(([name, f]) => [name, f.version])),
  entries: Object.values(FILES).flatMap((f) => f.entries as unknown as RuleEntry[]),
};

export const HSN_INDEX: {
  version: string;
  fetchedOn: string;
  fetched: boolean;
  hsnChapters: Array<{ chapter: string; heading: string }>;
  sacHeadings: Array<{ code: string; heading: string }>;
} = hsnIndex;

/** Every entry of a kind in force on the date, newest first. */
export function rulesOn(kind: RuleKind, dateIso: string, rules: RulePack = GST_RULES): RuleEntry[] {
  return rules.entries
    .filter((e) => e.kind === kind && e.effectiveFrom <= dateIso && (!e.effectiveTo || dateIso <= e.effectiveTo))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
}
/** The entry of a kind in force on the date (the newest when several), or null. */
export function ruleOn(kind: RuleKind, dateIso: string, rules: RulePack = GST_RULES): RuleEntry | null {
  return rulesOn(kind, dateIso, rules)[0] ?? null;
}
/** A value the pack's entry must carry (I5: rule values are data; Stage 3 review: code stood in for them). */
function missing(rule: RuleEntry, field: string): never {
  throw new RuleError(`rule ${rule.id} has no ${field}`);
}

/** Rule 46: the longest a document number may be on the date (the pack's tax-invoice fields entry). */
export function maxNumberLengthOn(dateIso: string, rules: RulePack = GST_RULES): number {
  const e = rulesOn('document-fields', dateIso, rules).find((x) => x.document === 'tax-invoice');
  if (!e) throw new RuleError(`no document-fields rule for a tax invoice on ${dateIso}`);
  return e.maxNumberLength ?? missing(e, 'maxNumberLength');
}

function need(kind: RuleKind, dateIso: string, rules: RulePack, id?: string): RuleEntry {
  const found = id
    ? rulesOn(kind, dateIso, rules).find((e) => e.id === id || e.id.startsWith(id))
    : ruleOn(kind, dateIso, rules);
  if (!found) throw new RuleError(`no ${kind}${id ? ` (${id})` : ''} rule for ${dateIso}`);
  return found;
}

/** What a rule says, in the owner's register and the accountant's. */
export function explain(
  ruleId: string,
  rules: RulePack = GST_RULES,
): { en: string; 'hi-Latn': string; source: string } | null {
  const e = rules.entries.find((x) => x.id === ruleId);
  return e ? { ...e.explain, source: e.source } : null;
}

/** The GST rates (per cent) a bill dated `dateIso` may carry; empty before the pack begins. */
export function selectableRates(dateIso: string, rules: RulePack = GST_RULES): number[] {
  return ruleOn('selectable-rates', dateIso, rules)?.ratesPercent ?? [];
}

export interface SupplyDecision {
  supply: Supply;
  /** Within the state: SGST, or UTGST in a Union Territory without a legislature. */
  stateHead: StateHead;
  ruleId: string;
}

/** Where the supply is taxed, from the pack's decide table; an unknown customer state counts as the table says. */
export function placeOfSupply(
  sellerStateCode: string | null,
  customerStateCode: string | null,
  dateIso: string,
  rules: RulePack = GST_RULES,
): SupplyDecision {
  const rule = need('place-of-supply', dateIso, rules);
  const decide = rule.decide;
  if (!decide) throw new RuleError(`place-of-supply rule ${rule.id} has no decide table`);
  const supply: Supply =
    !sellerStateCode || !customerStateCode
      ? decide.unknownState
      : sellerStateCode === customerStateCode
        ? decide.sameState
        : decide.otherState;
  const seller = findState(sellerStateCode);
  return { supply, stateHead: seller?.taxAuthority === 'UTGST' ? 'UTGST' : 'SGST', ruleId: rule.id };
}

/** Kept for callers that only need the intra/inter answer. */
export function supplyKind(
  sellerStateCode: string | null,
  customerStateCode: string | null,
  dateIso: string,
  rules: RulePack = GST_RULES,
): Supply {
  return placeOfSupply(sellerStateCode, customerStateCode, dateIso, rules).supply;
}

export type Registration = 'regular' | 'composition' | 'unregistered' | 'unknown';

/** The document a business issues on `dateIso`, from the pack, with the entry that decided it. */
export function documentKindRule(
  registration: Registration,
  gstOn: boolean,
  dateIso: string,
  rules: RulePack = GST_RULES,
): { kind: DocumentKind; ruleId: string } {
  const rule = need('document-kinds', dateIso, rules);
  if (!rule.kinds) throw new RuleError(`document-kinds rule ${rule.id} has no kinds`);
  const key = registration === 'regular' && !gstOn ? 'regular-gst-off' : registration;
  const kind = rule.kinds[key];
  if (!kind) throw new RuleError(`document-kinds rule ${rule.id} has no entry for ${key}`);
  return { kind, ruleId: rule.id };
}
export function documentKind(
  registration: Registration,
  gstOn: boolean,
  dateIso: string,
  rules: RulePack = GST_RULES,
): DocumentKind {
  return documentKindRule(registration, gstOn, dateIso, rules).kind;
}

/** How many HSN/SAC digits a bill must carry for a business of this turnover (previous year), B2B and B2C. */
export function hsnDigitsFor(
  turnoverPaise: number | null,
  dateIso: string,
  rules: RulePack = GST_RULES,
): { b2b: number; b2c: number; sacDigits: number; sacPrefix: string; ruleId: string } | null {
  const rule = ruleOn('hsn-digits', dateIso, rules);
  if (!rule?.bands) return null;
  const band =
    turnoverPaise === null
      ? rule.bands[0]!
      : (rule.bands.find((b) => b.turnoverUpToPaise === null || turnoverPaise <= b.turnoverUpToPaise) ??
        rule.bands.at(-1)!);
  return {
    b2b: band.b2bDigits,
    b2c: band.b2cDigits,
    sacDigits: rule.sacDigits ?? missing(rule, 'sacDigits'),
    sacPrefix: rule.sacPrefix ?? missing(rule, 'sacPrefix'),
    ruleId: rule.id,
  };
}

/** A threshold entry by id prefix in force on the date (e-invoice, B2C recipient details, B2CL). */
export function thresholdOn(
  idPrefix: string,
  dateIso: string,
  rules: RulePack = GST_RULES,
): { thresholdPaise: number; ruleId: string; entry: RuleEntry } | null {
  const rule = rulesOn('threshold', dateIso, rules).find((e) => e.id.startsWith(idPrefix));
  return rule?.thresholdPaise ? { thresholdPaise: rule.thresholdPaise, ruleId: rule.id, entry: rule } : null;
}

/** The composition scheme's limits and legend on the date. */
export function compositionRule(dateIso: string, rules: RulePack = GST_RULES): RuleEntry | null {
  return ruleOn('composition', dateIso, rules);
}

/** How many days a business of this turnover has to report a bill to the e-invoice portal (null: no window applies). */
export function irnReportingWindow(
  turnoverPaise: number | null,
  dateIso: string,
  rules: RulePack = GST_RULES,
): { days: number; ruleId: string } | null {
  const rule = ruleOn('reporting-window', dateIso, rules);
  if (!rule?.thresholdPaise || !rule.days || turnoverPaise === null) return null;
  return turnoverPaise >= rule.thresholdPaise ? { days: rule.days, ruleId: rule.id } : null;
}

/** The last date a credit note against an invoice dated `invoiceDateIso` may still reduce tax (s. 34(2)), from the pack. */
export function creditNoteDeadline(
  invoiceDateIso: string,
  rules: RulePack = GST_RULES,
): { dateIso: string; orAnnualReturn: boolean; ruleId: string } | null {
  const rule = ruleOn('deadline', invoiceDateIso, rules);
  if (!rule?.monthDay) return null;
  const year = Number(invoiceDateIso.slice(0, 4));
  const month = Number(invoiceDateIso.slice(5, 7));
  const fyEndYear = month >= 4 ? year + 1 : year; // the FY ends 31 March of this calendar year
  const deadlineYear = fyEndYear + (rule.yearsAfterFinancialYear ?? 1) - 1;
  return { dateIso: `${deadlineYear}-${rule.monthDay}`, orAnnualReturn: rule.orAnnualReturn ?? true, ruleId: rule.id };
}

/** When a return for `period` (YYYY-MM) falls due, by form, frequency and the business's state (quarterly 3B differs by group). */
export function returnDueDate(
  form: 'GSTR-1' | 'GSTR-3B',
  frequency: 'monthly' | 'quarterly',
  period: string,
  stateCode: string | null,
  rules: RulePack = GST_RULES,
): { dateIso: string; ruleId: string } | null {
  const periodEnd = `${period}-28`;
  const rule = rulesOn('due-date', periodEnd, rules).find((e) => e.form === form && e.frequency === frequency);
  if (!rule) return null;
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const nextMonth = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  let day: number;
  if (frequency === 'monthly') day = rule.dayOfNextMonth ?? missing(rule, 'dayOfNextMonth');
  else {
    const groupA = stateCode && rule.groupAStates?.includes(stateCode);
    day =
      groupA && rule.dayAfterQuarterEndGroupA
        ? rule.dayAfterQuarterEndGroupA
        : (rule.dayAfterQuarterEnd ?? missing(rule, 'dayAfterQuarterEnd'));
  }
  return {
    dateIso: `${nextMonth.y}-${String(nextMonth.m).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    ruleId: rule.id,
  };
}

/** The pack's entries that are still unverified: the report lists them for the operator. */
export function unverifiedRules(rules: RulePack = GST_RULES): Array<{ id: string; source: string }> {
  return rules.entries.filter((e) => !e.verified).map((e) => ({ id: e.id, source: e.source }));
}
