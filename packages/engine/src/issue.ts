import {
  assessDocument,
  type AssessBusiness,
  type AssessCustomer,
  type Assessment,
  type Blocker,
  type SupplyFlag,
} from './assess';
import type { CivilDate } from './dates';
import { GST_RULES, RuleError, type RulePack } from './rules';
import { computeTax, type TaxLine, type TaxLineInput, type TaxResult } from './tax';

/**
 * prepareIssue (I2): everything the issuing transaction needs, computed
 * once, purely. It assesses the draft, computes the tax, and builds the
 * snapshot the document carries for good: seller, customer, lines, totals,
 * the rule pack version and the entries that decided it. Blockers come
 * back instead when the document may not be issued. The database
 * (packages/db/repos/documents.ts) allocates the number and writes; it never
 * recomputes.
 */
export interface IssueLine extends TaxLineInput {
  id?: string;
  taxRateChosen: boolean;
}
export interface IssueDraft {
  kind: 'bill' | 'credit-note';
  dateIso: CivilDate;
  gstOn: boolean;
  lines: IssueLine[];
  placeOfSupplyStateCode: string | null;
  flags?: readonly SupplyFlag[];
  roundToRupee?: boolean;
  /** Free text printed under the lines (a contract's standing, a note). */
  notes?: string | null;
  linkedInvoice?: { id: string; number: string; dateIso: CivilDate } | null;
}
export interface IssueBusiness extends AssessBusiness {
  legalName: string;
  tradeName: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  upi: string | null;
  bank?: { name: string; account: string; ifsc: string } | null;
  /** Where the logo and signature live (Stage 4 saves them); the snapshot carries the references, not the bytes. */
  logoRef?: string | null;
  signatureRef?: string | null;
}
export interface IssueCustomer extends AssessCustomer {
  id: string | null;
  phone: string | null;
  city?: string | null;
}
export interface IssuedSnapshot {
  version: 1;
  rulePackVersion: string;
  rulesApplied: string[];
  kind: Assessment['kind'];
  title: string;
  dateIso: CivilDate;
  seller: Omit<IssueBusiness, 'turnoverPaise' | 'eInvoiceSelfDeclaredNotApplicable' | 'eInvoiceExemption'>;
  customer: IssueCustomer;
  placeOfSupplyStateCode: string | null;
  supply: TaxResult['supply'];
  stateHead: TaxResult['stateHead'];
  lines: TaxLine[];
  totals: Pick<
    TaxResult,
    | 'grossPaise'
    | 'discountPaise'
    | 'subtotalPaise'
    | 'cgstPaise'
    | 'statePaise'
    | 'igstPaise'
    | 'cessPaise'
    | 'gstPaise'
    | 'totalBeforeRoundingPaise'
    | 'roundOffPaise'
    | 'totalPaise'
    | 'heads'
    | 'rateSummary'
  >;
  flags: SupplyFlag[];
  notes: string | null;
  legend: string | null;
  linkedInvoice: { id: string; number: string; dateIso: CivilDate } | null;
}
export type PrepareResult =
  | { ok: false; blockers: Blocker[]; assessment: Assessment }
  | {
      ok: true;
      kind: Exclude<Assessment['kind'], 'blocked'>;
      title: string;
      totals: TaxResult;
      snapshot: IssuedSnapshot;
      assessment: Assessment;
    };

export function prepareIssue(
  draft: IssueDraft,
  business: IssueBusiness,
  customer: IssueCustomer,
  rules: RulePack = GST_RULES,
  today: CivilDate,
): PrepareResult {
  const lines = draft.lines.filter((l) => l.description.trim());
  let totals: TaxResult;
  try {
    totals = computeTax({
      lines,
      registration: business.registration,
      gstOn: draft.gstOn,
      dateIso: draft.dateIso,
      sellerStateCode: business.stateCode,
      customerStateCode: draft.placeOfSupplyStateCode ?? customer.stateCode,
      roundToRupee: draft.roundToRupee ?? false,
      rules,
    });
  } catch (e) {
    if (!(e instanceof RuleError)) throw e;
    const assessment: Assessment = {
      kind: 'blocked',
      title: 'DRAFT',
      chargesGst: false,
      canIssue: false,
      blockers: [
        {
          code: 'no-rules-for-date',
          message: { key: 'assess.no-rules-for-date' },
          whatYouCanDo: { key: 'assess.no-rules-for-date.do' },
          ruleId: null,
        },
      ],
      notices: [],
      ruleIds: [],
      legend: null,
    };
    return { ok: false, blockers: assessment.blockers, assessment };
  }
  const assessment = assessDocument(
    {
      business,
      customer,
      document: {
        kind: draft.kind,
        dateIso: draft.dateIso,
        gstOn: draft.gstOn,
        placeOfSupplyStateCode: draft.placeOfSupplyStateCode ?? customer.stateCode,
        lines: lines.map((l) => ({
          description: l.description,
          gstBp: l.gstBp,
          taxRateChosen: l.taxRateChosen,
          hsnCode: l.hsnCode ?? null,
        })),
        flags: draft.flags ?? [],
        totals,
        linkedInvoice: draft.linkedInvoice ?? null,
      },
      today,
    },
    rules,
  );
  if (!lines.length)
    assessment.blockers.push({
      code: 'no-lines',
      message: { key: 'assess.no-lines' },
      whatYouCanDo: { key: 'assess.no-lines.do' },
      ruleId: null,
    });
  if (!assessment.canIssue || assessment.kind === 'blocked' || assessment.blockers.length)
    return { ok: false, blockers: assessment.blockers, assessment };
  const { turnoverPaise: _t, eInvoiceSelfDeclaredNotApplicable: _e, eInvoiceExemption: _x, ...seller } = business;
  const snapshot: IssuedSnapshot = {
    version: 1,
    rulePackVersion: rules.version,
    rulesApplied: [...new Set([...totals.rulesApplied, ...assessment.ruleIds])],
    kind: assessment.kind,
    title: assessment.title,
    dateIso: draft.dateIso,
    seller,
    customer,
    placeOfSupplyStateCode: draft.placeOfSupplyStateCode ?? customer.stateCode,
    supply: totals.supply,
    stateHead: totals.stateHead,
    lines: totals.lines,
    totals: {
      grossPaise: totals.grossPaise,
      discountPaise: totals.discountPaise,
      subtotalPaise: totals.subtotalPaise,
      cgstPaise: totals.cgstPaise,
      statePaise: totals.statePaise,
      igstPaise: totals.igstPaise,
      cessPaise: totals.cessPaise,
      gstPaise: totals.gstPaise,
      totalBeforeRoundingPaise: totals.totalBeforeRoundingPaise,
      roundOffPaise: totals.roundOffPaise,
      totalPaise: totals.totalPaise,
      heads: totals.heads,
      rateSummary: totals.rateSummary,
    },
    flags: [...(draft.flags ?? [])],
    notes: draft.notes ?? null,
    legend: assessment.legend,
    linkedInvoice: draft.linkedInvoice ?? null,
  };
  return { ok: true, kind: assessment.kind, title: assessment.title, totals, snapshot, assessment };
}

/**
 * The lines of a credit note for `amountPaise` against a bill: one tax-inclusive line for each HSN code,
 * rate, cess and unit the bill carried, its share in proportion to that group's value on the bill (the
 * last group takes the paisa left over). So the GST a note reverses is the GST the bill charged, and
 * GSTR-1's HSN table nets the note against the bill's own codes rather than a row with no code.
 */
export function creditNoteLines(billLines: readonly TaxLine[], amountPaise: number, description: string): IssueLine[] {
  const groups = new Map<
    string,
    { hsnCode: string | null; unit: string | null; gstBp: number; cessBp: number; gross: number }
  >();
  for (const l of billLines) {
    if (l.blank || l.totalPaise <= 0) continue;
    const key = `${l.hsnCode ?? ''}|${l.gstBp}|${l.cessBp}|${l.unit ?? ''}`;
    const g = groups.get(key) ?? { hsnCode: l.hsnCode, unit: l.unit, gstBp: l.gstBp, cessBp: l.cessBp, gross: 0 };
    g.gross += l.totalPaise;
    groups.set(key, g);
  }
  const all = [...groups.values()];
  const whole = all.reduce((sum, g) => sum + g.gross, 0);
  if (whole <= 0) return [];
  let left = amountPaise;
  return all
    .map((g, i) => {
      const part = i === all.length - 1 ? left : Math.round((amountPaise * g.gross) / whole);
      left -= part;
      return {
        description,
        quantityMilli: 1000,
        unitPricePaise: part,
        gstBp: g.gstBp,
        ...(g.cessBp ? { cessBp: g.cessBp } : {}),
        taxRateChosen: true,
        priceIncludesTax: true,
        hsnCode: g.hsnCode,
        unit: g.unit,
      };
    })
    .filter((l) => l.unitPricePaise > 0);
}
