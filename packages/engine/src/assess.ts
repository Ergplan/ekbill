import { addDays, compareDates, daysBetween, type CivilDate } from './dates';
import {
  GST_RULES,
  compositionRule,
  creditNoteDeadline,
  documentKindRule,
  hsnDigitsFor,
  irnReportingWindow,
  ruleOn,
  thresholdOn,
  type DocumentKind,
  type Registration,
  type RulePack,
} from './rules';
import { say, type Say } from './say';
import type { TaxResult } from './tax';

/**
 * What kind of document is this, and may it be issued at all? Salvaged from
 * the MVP's src/lib/gst/scenarios.ts (tag mvp-final) and extended with the
 * checks the Stage 3 prompt lists, each citing the rule entry it reads. The
 * words are dictionary keys (assess.<code>, assess.<code>.do) the screens
 * render in Hinglish with what the owner can do. The honest way to keep the
 * promise of a simple billing app is to refuse what this release cannot
 * issue correctly, while keeping the draft.
 */
export type SupplyFlag = 'export' | 'sez' | 'deemed-export' | 'reverse-charge' | 'advance-receipt' | 'non-gst-supply';

export interface AssessBusiness {
  registration: Registration;
  gstin: string | null;
  stateCode: string | null;
  /** The highest aggregate turnover of any financial year since 2017-18, in paise; null when the owner has not said. */
  turnoverPaise: number | null;
  /** The owner confirmed (once, under Aap) that e-invoicing does not apply to them. */
  eInvoiceSelfDeclaredNotApplicable: boolean;
  /** An e-invoice exemption category the business falls in, if any (the pack lists them). */
  eInvoiceExemption?: string | null;
}
export interface AssessCustomer {
  name: string;
  gstin: string | null;
  stateCode: string | null;
  address: string | null;
}
export interface AssessLine {
  description: string;
  gstBp: number;
  taxRateChosen: boolean;
  hsnCode: string | null;
}
export interface AssessDocument {
  kind: 'bill' | 'credit-note';
  dateIso: CivilDate;
  gstOn: boolean;
  placeOfSupplyStateCode: string | null;
  lines: AssessLine[];
  flags: readonly SupplyFlag[];
  /** The tax result for the document (computeTax), for the value thresholds. */
  totals: Pick<TaxResult, 'totalPaise' | 'supply'>;
  /** For a credit note: the invoice it corrects. */
  linkedInvoice?: { number: string; dateIso: CivilDate } | null;
}
export interface Blocker {
  code: string;
  message: Say;
  whatYouCanDo: Say;
  ruleId: string | null;
}
export interface Notice {
  code: string;
  message: Say;
  ruleId: string | null;
}
export interface Assessment {
  kind: DocumentKind | 'credit-note' | 'blocked';
  /** The heading printed on the document, in English (the paper is formal). */
  title: string;
  chargesGst: boolean;
  canIssue: boolean;
  blockers: Blocker[];
  notices: Notice[];
  /** Every rule entry this assessment read. */
  ruleIds: string[];
  /** The legend a bill of supply prints for a composition business, from the pack. */
  legend: string | null;
}

export const TITLES: Record<DocumentKind | 'credit-note', string> = {
  'tax-invoice': 'TAX INVOICE',
  'bill-of-supply': 'BILL OF SUPPLY',
  invoice: 'INVOICE',
  'credit-note': 'CREDIT NOTE',
};

export function assessDocument(
  input: { business: AssessBusiness; customer: AssessCustomer; document: AssessDocument; today: CivilDate },
  rules: RulePack = GST_RULES,
): Assessment {
  const { business, customer, document, today } = input;
  const blockers: Blocker[] = [];
  const notices: Notice[] = [];
  const ruleIds = new Set<string>();
  const block = (code: string, ruleId: string | null = null, params?: Record<string, string | number>) =>
    blockers.push({
      code,
      message: say(`assess.${code}`, params),
      whatYouCanDo: say(`assess.${code}.do`, params),
      ruleId,
    });
  const note = (code: string, ruleId: string | null = null, params?: Record<string, string | number>) =>
    notices.push({ code, message: say(`assess.${code}`, params), ruleId });

  // --- supplies this release does not issue -------------------------------
  for (const flag of document.flags) block(`unsupported-${flag}`);

  // --- the document kind, from the pack -----------------------------------
  let kind: Assessment['kind'] = 'blocked';
  let legend: string | null = null;
  if (business.registration === 'unknown') {
    block('gst-status-unconfirmed');
  } else {
    const k = documentKindRule(business.registration, document.gstOn, document.dateIso, rules);
    ruleIds.add(k.ruleId);
    kind = document.kind === 'credit-note' ? 'credit-note' : k.kind;
    if (business.registration === 'composition') {
      const c = compositionRule(document.dateIso, rules);
      if (c) {
        ruleIds.add(c.id);
        legend = c.legend ?? null;
        note('composition-legend', c.id);
        if (document.lines.some((l) => l.gstBp > 0)) block('composition-tax', c.id);
      }
    }
    if (business.registration === 'unregistered') note('unregistered-no-gst', k.ruleId);
    if (business.registration === 'regular' && !document.gstOn) note('gst-off-plain-invoice', k.ruleId);
  }
  const chargesGst =
    kind === 'tax-invoice' || (kind === 'credit-note' && document.gstOn && business.registration === 'regular');

  // --- a tax invoice needs the seller's GSTIN and state, a confirmed place of supply, every rate chosen ---
  if (chargesGst) {
    if (!business.gstin) block('missing-gstin');
    if (!business.stateCode) block('missing-seller-state');
    if (!document.placeOfSupplyStateCode) block('missing-place-of-supply');
    const missing = document.lines.filter((l) => !l.taxRateChosen).length;
    if (missing > 0) block('rate-not-chosen', null, { n: missing });
    // Every line nil-rated on a tax invoice: the document should be a bill of supply (s. 31(3)(c)); the owner switches GST off.
    if (document.lines.length && document.lines.every((l) => l.taxRateChosen && l.gstBp === 0))
      note('nil-rated-on-tax-invoice');
  }
  if (business.registration === 'regular' && business.gstin && customer.gstin && customer.gstin === business.gstin)
    block('self-billing');

  // --- the customer's GSTIN state against the place of supply: asked, not refused (goods may go elsewhere) ---
  if (
    chargesGst &&
    customer.gstin &&
    document.placeOfSupplyStateCode &&
    customer.gstin.slice(0, 2) !== document.placeOfSupplyStateCode
  )
    note('gstin-state-differs', 'place-of-supply-state', {
      gstinState: customer.gstin.slice(0, 2),
      pos: document.placeOfSupplyStateCode,
    });

  // --- a bill dated within a month of a rate change: its own date decides the rates, and it says so ---
  if (chargesGst) {
    const current = ruleOn('selectable-rates', document.dateIso, rules);
    const slabs = rules.entries.filter((e) => e.kind === 'selectable-rates');
    const first = slabs.map((e) => e.effectiveFrom).sort()[0];
    // A change is the start of any slab table after the first (the first is GST's own start).
    const change = slabs.find(
      (e) => e.effectiveFrom !== first && Math.abs(daysBetween(e.effectiveFrom, document.dateIso)) <= 31,
    );
    if (current && change) {
      ruleIds.add(current.id);
      note('rates-by-date', current.id, { from: change.effectiveFrom });
    }
  }

  // --- HSN digits by turnover band -----------------------------------------
  if (chargesGst) {
    const hsn = hsnDigitsFor(business.turnoverPaise, document.dateIso, rules);
    if (hsn) {
      ruleIds.add(hsn.ruleId);
      const needed = customer.gstin ? hsn.b2b : hsn.b2c;
      const short = document.lines.filter((l) => l.hsnCode && l.hsnCode.replace(/\D/g, '').length < needed);
      const absent = document.lines.filter((l) => !l.hsnCode);
      if (short.length) block('hsn-too-short', hsn.ruleId, { digits: needed, n: short.length });
      // The item screen (Stage 5) carries the HSN; until then an absent code is said, not blocked.
      if (needed > 0 && absent.length) note('hsn-missing', hsn.ruleId, { digits: needed, n: absent.length });
    }
  }

  // --- B2C ≥ ₹50,000: the customer's name, address and state ----------------
  if (chargesGst && !customer.gstin) {
    const t = thresholdOn('b2c-recipient-details', document.dateIso, rules);
    if (t) {
      ruleIds.add(t.ruleId);
      if (document.totals.totalPaise >= t.thresholdPaise && (!customer.address || !customer.stateCode))
        block('b2c-recipient-details', t.ruleId, { amount: Math.round(t.thresholdPaise / 100) });
    }
  }

  // --- e-invoicing: applicability and the reporting window ---------------
  if (chargesGst && business.registration === 'regular') {
    const e = thresholdOn('e-invoice-threshold', document.dateIso, rules);
    if (e) {
      ruleIds.add(e.ruleId);
      const exempt = business.eInvoiceExemption && e.entry.exemptions?.includes(business.eInvoiceExemption);
      if (!exempt) {
        // The owner's answer (asked once, under Aap) is the gate: a "no" is said, never overruled by a turnover
        // band; the GST checks of Stage 8 flag the contradiction. Without an answer, the band decides.
        if (business.eInvoiceSelfDeclaredNotApplicable) {
          // Said only where it matters: the turnover is unknown, or above the threshold (Stage 8's contradiction check).
          if (business.turnoverPaise === null || business.turnoverPaise > e.thresholdPaise)
            note('e-invoicing-self-declared', e.ruleId);
        } else if (business.turnoverPaise === null) block('e-invoicing-unscreened', e.ruleId);
        else if (business.turnoverPaise > e.thresholdPaise) {
          block('e-invoicing-applicable', e.ruleId);
          const w = irnReportingWindow(business.turnoverPaise, document.dateIso, rules);
          if (w) {
            ruleIds.add(w.ruleId);
            if (compareDates(addDays(document.dateIso, w.days), today) < 0)
              block('irn-window-passed', w.ruleId, { days: w.days });
          }
        }
      }
    }
  }

  // --- a credit note: the invoice it corrects, within the date limit --------
  if (document.kind === 'credit-note') {
    if (!document.linkedInvoice) block('credit-note-unlinked');
    else {
      const d = creditNoteDeadline(document.linkedInvoice.dateIso, rules);
      if (d) {
        ruleIds.add(d.ruleId);
        if (chargesGst && compareDates(today, d.dateIso) > 0)
          block('credit-note-late', d.ruleId, { date: d.dateIso, number: document.linkedInvoice.number });
      }
    }
  }

  const canIssue = blockers.length === 0 && kind !== 'blocked';
  return {
    kind,
    title: kind === 'blocked' ? 'DRAFT' : TITLES[kind],
    chargesGst,
    canIssue,
    blockers,
    notices,
    ruleIds: [...ruleIds],
    legend,
  };
}
