import {
  checkGstin,
  RuleError,
  computeTax,
  emptyTax,
  parseMoney,
  parseQuantity,
  selectableRates,
  type Registration,
  type TaxResult,
} from '@ekbill/engine';
import type { LineValue } from '@ekbill/ui';

/**
 * The form's view of the engine (I4): strings from the fields become
 * engine inputs; the engine does every calculation. Nothing here rounds,
 * taxes or decides a rate.
 */
export interface GstChoice {
  on: boolean;
  mode: 'one' | 'perline';
  rate: number;
  perLine: number[];
}
export interface BillDraft {
  customer: string | null;
  customerName: string;
  customerState: string | null;
  lines: LineValue[];
  gst: GstChoice;
  series: string;
  number: string;
  date: string;
  /** A kaccha bill (20 Oct): an estimate, numbered on its own; absent in drafts kept before it, so a pakka bill. */
  kaccha?: boolean;
}
export interface BusinessForBill {
  name: string;
  registration: Registration;
  stateCode: string | null;
  stateName: string | null;
  defaultRate: number;
  upi: string | null;
  gstin: string | null;
  address: string | null;
}
export type Computed = TaxResult & {
  overflow: boolean;
  /** The pack has no rule for the bill's date: nothing is taxed until the date is fixed. */ noRules: boolean;
};

function parseOr(f: () => number): number {
  try {
    return f();
  } catch {
    return 0;
  }
}

/** The engine's result for the draft. An unparsable field counts as zero; a product beyond the safe range marks `overflow` instead of throwing. */
export function compute(
  draft: Pick<BillDraft, 'lines' | 'gst' | 'customerState' | 'date'>,
  business: Pick<BusinessForBill, 'registration' | 'stateCode'>,
): Computed {
  const input = {
    lines: draft.lines.map((l, i) => ({
      description: l.what,
      quantityMilli: parseOr(() => parseQuantity(l.qty)),
      unitPricePaise: parseOr(() => parseMoney(l.rate)),
      gstBp: (draft.gst.mode === 'perline' ? (draft.gst.perLine[i] ?? draft.gst.rate) : draft.gst.rate) * 100,
    })),
    registration: business.registration,
    gstOn: draft.gst.on,
    dateIso: draft.date,
    sellerStateCode: business.stateCode,
    customerStateCode: draft.customerState,
  };
  try {
    return { ...computeTax(input), overflow: false, noRules: false };
  } catch (e) {
    if (e instanceof RuleError) return { ...emptyTax(), overflow: false, noRules: true };
    try {
      return { ...computeTax({ ...input, lines: [] }), overflow: true, noRules: false };
    } catch {
      return { ...emptyTax(), overflow: true, noRules: true };
    }
  }
}

/** The GST rates the form may offer for the bill's date, from the rule pack (I5). */
export function ratesFor(dateIso: string): number[] {
  return selectableRates(dateIso);
}

/** A brand-new owner's business, from the setup answers, until Stage 4 saves it. */
export interface SetupAnswers {
  name?: string;
  gst?: 'yes' | 'composition' | 'no' | 'unknown' | null;
  gstin?: string;
  upi?: string;
  city?: string;
}
export function businessFromSetup(setup: SetupAnswers | null, fallback: BusinessForBill): BusinessForBill {
  if (!setup) return fallback;
  const gst = setup.gstin ? checkGstin(setup.gstin) : null;
  const registration: Registration =
    setup.gst === 'yes'
      ? 'regular'
      : setup.gst === 'composition'
        ? 'composition'
        : setup.gst === 'no'
          ? 'unregistered'
          : 'unknown';
  return {
    ...fallback,
    name: setup.name?.trim() || fallback.name,
    registration,
    gstin: gst?.ok ? gst.normalised : null,
    stateCode: gst?.ok ? (gst.stateCode ?? null) : fallback.stateCode,
    stateName: gst?.ok ? (gst.stateName ?? null) : fallback.stateName,
    upi: setup.upi?.trim() || null,
    address: setup.city?.trim() || null,
  };
}

/**
 * The form's lines as the issue's checks take them (assess): each line's rate by its place in the form, read
 * before the blank rows are left out (Stage 8 review: after the filter, a blank first row moved every per-line
 * rate onto the line above it).
 */
export function assessLinesOf(
  d: Pick<BillDraft, 'lines' | 'gst'>,
  gstOn: boolean,
  hsnOf: (what: string) => string | null,
): Array<{ description: string; gstBp: number; taxRateChosen: boolean; hsnCode: string | null }> {
  return d.lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.what.trim() || l.rate.trim())
    .map(({ l, i }) => ({
      description: l.what,
      gstBp: gstOn ? Math.round((d.gst.mode === 'perline' ? (d.gst.perLine[i] ?? d.gst.rate) : d.gst.rate) * 100) : 0,
      taxRateChosen: true,
      hsnCode: hsnOf(l.what),
    }));
}

/**
 * The name typed on a bill opened for the customer just added (/customers/new). That customer's State came from
 * their GSTIN; typing a different name makes it someone else's bill, so the State goes back to what it was before
 * (asked again), and typing the name back brings it back. A State the owner chose stays.
 */
export function renamed(
  cur: BillDraft,
  name: string,
  lent: { name: string; stateCode: string | null } | null,
  before: string | null,
): BillDraft {
  if (!lent?.stateCode) return { ...cur, customerName: name };
  const was = cur.customerName.trim() === lent.name.trim();
  const is = name.trim() === lent.name.trim();
  if (was && !is && cur.customerState === lent.stateCode) return { ...cur, customerName: name, customerState: before };
  if (!was && is && cur.customerState === before) return { ...cur, customerName: name, customerState: lent.stateCode };
  return { ...cur, customerName: name };
}

/**
 * The photo's own total against the lines as they stand now, before GST (as the reader compared them), so the note
 * follows the owner's edits (Stage 7 review: it was the worker's comparison, and stayed after a fix). Null when the
 * photo had no total, else the lines' figure and whether it differs.
 */
export function photoTotalCheck(
  imageTotalPaise: number | null,
  draft: Pick<BillDraft, 'lines' | 'customerState' | 'date'>,
  business: Pick<BusinessForBill, 'registration' | 'stateCode'>,
): { linesPaise: number; differs: boolean } | null {
  if (imageTotalPaise === null) return null;
  const linesPaise = compute({ ...draft, gst: { on: false, mode: 'one', rate: 0, perLine: [] } }, business).totalPaise;
  return { linesPaise, differs: linesPaise !== imageTotalPaise };
}
