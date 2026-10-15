import { applyBasisPoints, assertSafe, lineGross, sum, type BasisPoints, type Milli, type Paise } from './money';
import type { Supply } from './rules';

/**
 * The one tax calculation (I4). Every preview, document, receipt and
 * working reads this output. Pure: dates and rates are passed in; integer
 * paise throughout; each tax head is computed from the taxable value at
 * its own rate (never derived from a rounded sibling), per money.ts.
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
  supply: Supply;
}
export interface TaxLine {
  description: string;
  quantityMilli: Milli;
  unitPricePaise: Paise;
  taxablePaise: Paise;
  gstBp: BasisPoints;
  cgstPaise: Paise;
  sgstPaise: Paise;
  igstPaise: Paise;
  /** A line with no description is kept for the form but carries no value (never an invisible charge). */
  blank: boolean;
}
export interface TaxResult {
  lines: TaxLine[];
  subtotalPaise: Paise;
  cgstPaise: Paise;
  sgstPaise: Paise;
  igstPaise: Paise;
  gstPaise: Paise;
  totalPaise: Paise;
  /** The tax lines as the document prints them, in order. Empty when nothing is taxed. */
  heads: Array<{ label: string; paise: Paise }>;
  /** tax-invoice for a regular business, bill-of-supply for composition, invoice otherwise. */
  documentKind: 'tax-invoice' | 'bill-of-supply' | 'invoice';
}

export function computeTax(input: TaxInput): TaxResult {
  const taxed = input.gstOn && input.registration === 'regular';
  const lines: TaxLine[] = input.lines.map((l) => {
    const blank = !l.description.trim();
    const taxablePaise = blank
      ? 0
      : lineGross(assertSafe(l.quantityMilli, 'quantity'), assertSafe(l.unitPricePaise, 'unit price'));
    const gstBp = taxed ? assertSafe(l.gstBp, 'gst rate') : 0;
    const halfBp = gstBp / 2; // basis points are even for every slab the pack carries; a stray odd value still rounds per head
    const intra = input.supply === 'intra';
    return {
      description: l.description,
      quantityMilli: l.quantityMilli,
      unitPricePaise: l.unitPricePaise,
      taxablePaise,
      gstBp,
      cgstPaise: intra ? applyBasisPoints(taxablePaise, Math.trunc(halfBp)) : 0,
      sgstPaise: intra ? applyBasisPoints(taxablePaise, Math.trunc(halfBp)) : 0,
      igstPaise: intra ? 0 : applyBasisPoints(taxablePaise, gstBp),
      blank,
    };
  });
  const subtotalPaise = sum(lines.map((l) => l.taxablePaise));
  const cgstPaise = sum(lines.map((l) => l.cgstPaise));
  const sgstPaise = sum(lines.map((l) => l.sgstPaise));
  const igstPaise = sum(lines.map((l) => l.igstPaise));
  const gstPaise = cgstPaise + sgstPaise + igstPaise;
  const rates = [...new Set(lines.filter((l) => l.gstBp && !l.blank).map((l) => l.gstBp))];
  const pct = (bp: number) => `${bp / 100}%`;
  const heads: TaxResult['heads'] = [];
  if (gstPaise > 0) {
    if (igstPaise) heads.push({ label: rates.length === 1 ? `IGST ${pct(rates[0]!)}` : 'IGST', paise: igstPaise });
    else {
      heads.push({ label: rates.length === 1 ? `CGST ${pct(rates[0]! / 2)}` : 'CGST', paise: cgstPaise });
      heads.push({ label: rates.length === 1 ? `SGST ${pct(rates[0]! / 2)}` : 'SGST', paise: sgstPaise });
    }
  }
  const documentKind =
    input.registration === 'composition'
      ? 'bill-of-supply'
      : input.registration === 'regular'
        ? 'tax-invoice'
        : 'invoice';
  return {
    lines,
    subtotalPaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    gstPaise,
    totalPaise: subtotalPaise + gstPaise,
    heads,
    documentKind,
  };
}
