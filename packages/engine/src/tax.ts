import {
  applyBasisPoints,
  assertSafe,
  divRound,
  lineGross,
  roundToRupee,
  sum,
  taxableFromInclusive,
  type BasisPoints,
  type Milli,
  type Paise,
} from './money';
import {
  documentKindRule,
  placeOfSupply,
  type DocumentKind,
  type Registration,
  type RulePack,
  type StateHead,
  type Supply,
} from './rules';

/**
 * The one tax calculation (I4). Every preview, document, receipt and
 * working reads this output. Pure: the date, the rates and the rule pack
 * are passed in; integer paise throughout; each tax head is computed from
 * the taxable value at its own rate (never derived from a rounded sibling),
 * per money.ts. Half rates are exact: CGST at bp/2 is taxable × bp / 20 000,
 * rounded half-up once. Salvaged from the MVP's src/lib/gst/tax-engine.ts
 * (tag mvp-final): discount before tax, tax-inclusive prices backed out
 * through the combined rate, cess as its own head, the rupee round-off as a
 * visible reconciling figure, the rate-wise summary the return tables use.
 */
export type { Registration } from './rules';

export class TaxEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaxEngineError';
  }
}

export interface TaxLineInput {
  description: string;
  quantityMilli: Milli;
  unitPricePaise: Paise;
  /** Basis points, e.g. 1800 for 18 %. Ignored unless the document is a tax invoice. */
  gstBp: BasisPoints;
  /** Line discount in paise (absolute), applied before tax. */
  discountPaise?: Paise;
  /** Compensation cess in basis points, kept as a head of its own. */
  cessBp?: BasisPoints;
  /** When true, `unitPricePaise` already contains the tax (and the cess). */
  priceIncludesTax?: boolean;
  hsnCode?: string | null;
  unit?: string | null;
}
export interface TaxInput {
  lines: TaxLineInput[];
  registration: Registration;
  /** Per-bill switch ("GST lagega? Nahi"): off means a plain invoice with no tax lines. */
  gstOn: boolean;
  /** The document's date (ISO), which selects the rules. */
  dateIso: string;
  sellerStateCode: string | null;
  customerStateCode: string | null;
  /** Round the grand total to the nearest rupee, carried as a visible round-off line. */
  roundToRupee?: boolean;
  rules?: RulePack;
}
export interface TaxLine {
  description: string;
  quantityMilli: Milli;
  unitPricePaise: Paise;
  /** quantity × unit price, before the discount (and before backing tax out of an inclusive price). */
  grossPaise: Paise;
  discountPaise: Paise;
  taxablePaise: Paise;
  gstBp: BasisPoints;
  cessBp: BasisPoints;
  cgstPaise: Paise;
  /** SGST or UTGST, per `stateHead`. */
  statePaise: Paise;
  igstPaise: Paise;
  cessPaise: Paise;
  taxPaise: Paise;
  totalPaise: Paise;
  hsnCode: string | null;
  unit: string | null;
  /** A line with no description is kept for the form but carries no value (never an invisible charge). */
  blank: boolean;
}
export interface RateSummaryRow {
  gstBp: BasisPoints;
  cessBp: BasisPoints;
  taxablePaise: Paise;
  cgstPaise: Paise;
  statePaise: Paise;
  igstPaise: Paise;
  cessPaise: Paise;
}
export interface TaxResult {
  lines: TaxLine[];
  /** Sum of the lines' gross (before discounts). */
  grossPaise: Paise;
  discountPaise: Paise;
  /** The taxable value: what GST is charged on. */
  subtotalPaise: Paise;
  cgstPaise: Paise;
  statePaise: Paise;
  stateHead: StateHead;
  igstPaise: Paise;
  cessPaise: Paise;
  /** CGST + state head + IGST + cess. */
  gstPaise: Paise;
  /** Taxable value plus every tax head, before the rupee round-off. */
  totalBeforeRoundingPaise: Paise;
  roundOffPaise: Paise;
  /** What the customer pays. */
  totalPaise: Paise;
  supply: Supply;
  /** The tax lines as the document prints them, in order. Empty when nothing is taxed. */
  heads: Array<{ label: string; paise: Paise }>;
  /** Rate-wise summary, which is what the GST return tables are built from. */
  rateSummary: RateSummaryRow[];
  /** When an odd basis-point rate splits unevenly, the lines where CGST and the state head differ by a paisa. */
  headRoundingNote: string | null;
  documentKind: DocumentKind;
  /** Which rule entries decided this result (the document snapshot records them). */
  rulesApplied: string[];
}

export function computeTax(input: TaxInput): TaxResult {
  const place = placeOfSupply(input.sellerStateCode, input.customerStateCode, input.dateIso, input.rules);
  const kindRule = documentKindRule(input.registration, input.gstOn, input.dateIso, input.rules);
  const kind = kindRule.kind;
  const taxed = kind === 'tax-invoice';
  const intra = place.supply === 'intra';
  const headNotes: string[] = [];
  const lines: TaxLine[] = input.lines.map((l) => {
    const blank = !l.description.trim();
    const quantityMilli = assertSafe(l.quantityMilli, 'quantity');
    const unitPricePaise = assertSafe(l.unitPricePaise, 'unit price');
    if (quantityMilli < 0) throw new TaxEngineError(`Quantity cannot be negative on "${l.description}"`);
    if (unitPricePaise < 0) throw new TaxEngineError(`Price cannot be negative on "${l.description}"`);
    const gstBp = taxed ? assertSafe(l.gstBp, 'gst rate') : 0;
    const cessBp = taxed ? assertSafe(l.cessBp ?? 0, 'cess rate') : 0;
    if (gstBp < 0 || gstBp > 100_000) throw new TaxEngineError(`Tax rate out of range on "${l.description}"`);
    if (cessBp < 0 || cessBp > 100_000) throw new TaxEngineError(`Cess rate out of range on "${l.description}"`);
    const grossPaise = blank ? 0 : lineGross(quantityMilli, unitPricePaise);
    const discountPaise = blank ? 0 : assertSafe(l.discountPaise ?? 0, 'discount');
    if (discountPaise < 0) throw new TaxEngineError(`Discount cannot be negative on "${l.description}"`);
    if (discountPaise > grossPaise)
      throw new TaxEngineError(`Discount is larger than the line amount on "${l.description}"`);
    // For a tax-inclusive price the entered figure contains tax and cess: back the taxable value out through the
    // combined rate, then compute each head forward from it, so there is one code path.
    const net = grossPaise - discountPaise;
    const taxablePaise = l.priceIncludesTax && taxed ? taxableFromInclusive(net, gstBp + cessBp) : net;
    const half = (base: Paise) => divRound(base * gstBp, 20_000); // the head at half the rate, exact to the paise
    const full = (base: Paise) => divRound(base * gstBp, 10_000);
    const cgstPaise = intra ? half(taxablePaise) : 0;
    const statePaise = intra ? half(taxablePaise) : 0;
    const igstPaise = intra ? 0 : full(taxablePaise);
    const cessPaise = applyBasisPoints(taxablePaise, cessBp);
    if (intra && cgstPaise !== statePaise) {
      headNotes.push(
        `"${l.description}": an odd tax rate splits unevenly, so CGST and ${place.stateHead} differ by ${Math.abs(cgstPaise - statePaise)} paise.`,
      );
    }
    const taxPaise = cgstPaise + statePaise + igstPaise + cessPaise;
    // A tax-inclusive figure is the line's total, to the paisa: the taxable value takes the rounding of the heads
    // (a paisa either way), so ₹1,422.76 entered is ₹1,422.76 billed, and a credit note for a whole bill gives back
    // exactly its taxable value and tax.
    const lineTaxablePaise = l.priceIncludesTax && taxed ? net - taxPaise : taxablePaise;
    return {
      description: l.description,
      quantityMilli,
      unitPricePaise,
      grossPaise,
      discountPaise,
      taxablePaise: lineTaxablePaise,
      gstBp,
      cessBp,
      cgstPaise,
      statePaise,
      igstPaise,
      cessPaise,
      taxPaise,
      totalPaise: lineTaxablePaise + taxPaise,
      hsnCode: l.hsnCode ?? null,
      unit: l.unit ?? null,
      blank,
    };
  });
  const grossPaise = sum(lines.map((l) => l.grossPaise));
  const discountPaise = sum(lines.map((l) => l.discountPaise));
  const subtotalPaise = sum(lines.map((l) => l.taxablePaise));
  const cgstPaise = sum(lines.map((l) => l.cgstPaise));
  const statePaise = sum(lines.map((l) => l.statePaise));
  const igstPaise = sum(lines.map((l) => l.igstPaise));
  const cessPaise = sum(lines.map((l) => l.cessPaise));
  const gstPaise = cgstPaise + statePaise + igstPaise + cessPaise;
  const totalBeforeRoundingPaise = subtotalPaise + gstPaise;
  const totalPaise = input.roundToRupee ? roundToRupee(totalBeforeRoundingPaise) : totalBeforeRoundingPaise;
  const roundOffPaise = totalPaise - totalBeforeRoundingPaise;

  const rates = [...new Set(lines.filter((l) => l.gstBp && !l.blank).map((l) => l.gstBp))];
  const pct = (bp: number) => `${bp / 100}%`;
  const heads: TaxResult['heads'] = [];
  if (cgstPaise + statePaise + igstPaise > 0) {
    if (!intra) heads.push({ label: rates.length === 1 ? `IGST ${pct(rates[0]!)}` : 'IGST', paise: igstPaise });
    else {
      heads.push({ label: rates.length === 1 ? `CGST ${pct(rates[0]! / 2)}` : 'CGST', paise: cgstPaise });
      heads.push({
        label: rates.length === 1 ? `${place.stateHead} ${pct(rates[0]! / 2)}` : place.stateHead,
        paise: statePaise,
      });
    }
  }
  if (cessPaise > 0) heads.push({ label: 'Cess', paise: cessPaise });
  if (roundOffPaise !== 0) heads.push({ label: 'Round off', paise: roundOffPaise });

  const groups = new Map<string, RateSummaryRow>();
  for (const l of lines) {
    if (l.blank) continue;
    const key = `${l.gstBp}|${l.cessBp}`;
    const row = groups.get(key) ?? {
      gstBp: l.gstBp,
      cessBp: l.cessBp,
      taxablePaise: 0,
      cgstPaise: 0,
      statePaise: 0,
      igstPaise: 0,
      cessPaise: 0,
    };
    row.taxablePaise += l.taxablePaise;
    row.cgstPaise += l.cgstPaise;
    row.statePaise += l.statePaise;
    row.igstPaise += l.igstPaise;
    row.cessPaise += l.cessPaise;
    groups.set(key, row);
  }

  return {
    lines,
    grossPaise,
    discountPaise,
    subtotalPaise,
    cgstPaise,
    statePaise,
    stateHead: place.stateHead,
    igstPaise,
    cessPaise,
    gstPaise,
    totalBeforeRoundingPaise,
    roundOffPaise,
    totalPaise,
    supply: place.supply,
    heads,
    rateSummary: [...groups.values()].sort((a, b) => a.gstBp - b.gstBp || a.cessBp - b.cessBp),
    headRoundingNote: headNotes.length ? headNotes.join(' ') : null,
    documentKind: kind,
    rulesApplied: [place.ruleId, kindRule.ruleId],
  };
}

/** The result of nothing: what a form shows while the pack has no rule for the date (no tax, no heads, no rules). */
export function emptyTax(): TaxResult {
  return {
    lines: [],
    grossPaise: 0,
    discountPaise: 0,
    subtotalPaise: 0,
    cgstPaise: 0,
    statePaise: 0,
    stateHead: 'SGST',
    igstPaise: 0,
    cessPaise: 0,
    gstPaise: 0,
    totalBeforeRoundingPaise: 0,
    roundOffPaise: 0,
    totalPaise: 0,
    supply: 'intra',
    heads: [],
    rateSummary: [],
    headRoundingNote: null,
    documentKind: 'invoice',
    rulesApplied: [],
  };
}
