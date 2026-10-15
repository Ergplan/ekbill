import { assertSafe, divRound, lineGross, sum, type BasisPoints, type Milli, type Paise } from './money';
import { documentKind, placeOfSupply, type DocumentKind, type RulePack, type StateHead, type Supply } from './rules';

/**
 * The one tax calculation (I4). Every preview, document, receipt and
 * working reads this output. Pure: the date, the rates and the rule pack
 * are passed in; integer paise throughout; each tax head is computed from
 * the taxable value at its own rate (never derived from a rounded sibling),
 * per money.ts. Half rates are exact: CGST at bp/2 is taxable × bp / 20 000,
 * rounded half-up once.
 */
export type Registration = 'regular' | 'composition' | 'unregistered' | 'unknown';

export interface TaxLineInput {
  description: string;
  quantityMilli: Milli;
  unitPricePaise: Paise;
  /** Basis points, e.g. 1800 for 18 %. Ignored unless the business is regular and GST is on. */
  gstBp: BasisPoints;
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
  rules?: RulePack;
}
export interface TaxLine {
  description: string;
  quantityMilli: Milli;
  unitPricePaise: Paise;
  taxablePaise: Paise;
  gstBp: BasisPoints;
  cgstPaise: Paise;
  /** SGST or UTGST, per `stateHead`. */
  statePaise: Paise;
  igstPaise: Paise;
  /** A line with no description is kept for the form but carries no value (never an invisible charge). */
  blank: boolean;
}
export interface TaxResult {
  lines: TaxLine[];
  subtotalPaise: Paise;
  cgstPaise: Paise;
  statePaise: Paise;
  stateHead: StateHead;
  igstPaise: Paise;
  gstPaise: Paise;
  totalPaise: Paise;
  supply: Supply;
  /** The tax lines as the document prints them, in order. Empty when nothing is taxed. */
  heads: Array<{ label: string; paise: Paise }>;
  documentKind: DocumentKind;
  /** Which rule entries decided this result (the document snapshot records them). */
  rulesApplied: string[];
}

export function computeTax(input: TaxInput): TaxResult {
  const place = placeOfSupply(input.sellerStateCode, input.customerStateCode, input.dateIso, input.rules);
  const kind = documentKind(input.registration, input.gstOn, input.dateIso, input.rules);
  const taxed = kind === 'tax-invoice';
  const intra = place.supply === 'intra';
  const lines: TaxLine[] = input.lines.map((l) => {
    const blank = !l.description.trim();
    const taxablePaise = blank
      ? 0
      : lineGross(assertSafe(l.quantityMilli, 'quantity'), assertSafe(l.unitPricePaise, 'unit price'));
    const gstBp = taxed ? assertSafe(l.gstBp, 'gst rate') : 0;
    const half = (base: Paise) => divRound(base * gstBp, 20_000); // the head at half the rate, exact to the paise
    const full = (base: Paise) => divRound(base * gstBp, 10_000);
    return {
      description: l.description,
      quantityMilli: l.quantityMilli,
      unitPricePaise: l.unitPricePaise,
      taxablePaise,
      gstBp,
      cgstPaise: intra ? half(taxablePaise) : 0,
      statePaise: intra ? half(taxablePaise) : 0,
      igstPaise: intra ? 0 : full(taxablePaise),
      blank,
    };
  });
  const subtotalPaise = sum(lines.map((l) => l.taxablePaise));
  const cgstPaise = sum(lines.map((l) => l.cgstPaise));
  const statePaise = sum(lines.map((l) => l.statePaise));
  const igstPaise = sum(lines.map((l) => l.igstPaise));
  const gstPaise = cgstPaise + statePaise + igstPaise;
  const rates = [...new Set(lines.filter((l) => l.gstBp && !l.blank).map((l) => l.gstBp))];
  const pct = (bp: number) => `${bp / 100}%`;
  const heads: TaxResult['heads'] = [];
  if (gstPaise > 0) {
    if (!intra) heads.push({ label: rates.length === 1 ? `IGST ${pct(rates[0]!)}` : 'IGST', paise: igstPaise });
    else {
      heads.push({ label: rates.length === 1 ? `CGST ${pct(rates[0]! / 2)}` : 'CGST', paise: cgstPaise });
      heads.push({
        label: rates.length === 1 ? `${place.stateHead} ${pct(rates[0]! / 2)}` : place.stateHead,
        paise: statePaise,
      });
    }
  }
  return {
    lines,
    subtotalPaise,
    cgstPaise,
    statePaise,
    stateHead: place.stateHead,
    igstPaise,
    gstPaise,
    totalPaise: subtotalPaise + gstPaise,
    supply: place.supply,
    heads,
    documentKind: kind,
    rulesApplied: [place.ruleId, 'document-kinds'].filter(Boolean),
  };
}
