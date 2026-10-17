import { MoneyError, formatMoneyPlain, formatQuantityPlain, parseMoney, parseQuantity } from './money';
import { say, type Say } from './say';
import type { TaxLineInput } from './tax';

/**
 * The bill as the owner types it: what did you do, how many, at what rate.
 * Salvaged from the MVP (src/lib/domain/bill-form.ts, tag mvp-final): the
 * three fields become the lines the tax engine takes, and what is wrong is
 * said as a dictionary key (the MVP returned the Hinglish text; the engine
 * owns no words).
 */
export interface LineDraft {
  id: string;
  /** "Kya kiya?" */
  what: string;
  /** "Kitna": a count, as typed. "1" by default. */
  qty: string;
  /** "Rate (₹)": rupees, as typed. */
  rate: string;
  /** This line's own GST rate, in basis points, when the owner chose "Har cheez ka alag rate". Absent or null: the bill's rate applies. */
  gstBp?: number | null;
}
export interface BillFormDraft {
  customerName: string;
  customerPhone: string;
  /** Only asked when the owner charges GST: it decides IGST or CGST+SGST. */
  customerGstin: string;
  lines: LineDraft[];
  /** Basis points: the bill's rate, and every line's unless it has its own. Only asked of a GST-registered owner. */
  gstRateBp: number | null;
  /** "GST lagega?": a registered owner can say Nahi for one bill. */
  gstOn: boolean;
  /** "Har cheez ka alag rate": each line shows its own rate. */
  perLine: boolean;
}
/** A line priced for the engine, with whether the owner actually chose its rate (0% is a legal choice, so zero cannot mean "unanswered"). */
export interface CheckedLine extends TaxLineInput {
  id: string;
  taxRateChosen: boolean;
}
export type BillProblem =
  { field: 'customerName' } | { field: 'lines' } | { field: 'what' | 'qty' | 'rate'; lineId: string };
export type BillCheck = { ok: true; lines: CheckedLine[] } | { ok: false; problem: BillProblem; message: Say };

export function blankLine(id: string): LineDraft {
  return { id, what: '', qty: '1', rate: '' };
}
/** A line the owner has not touched. Skipped rather than complained about. */
export function isBlankLine(line: LineDraft): boolean {
  return !line.what.trim() && !line.rate.trim();
}
/** The GST rate a line is charged at, or null when the owner has not chosen one. */
export function lineRateBp(draft: Pick<BillFormDraft, 'gstRateBp' | 'perLine'>, line: LineDraft): number | null {
  if (draft.perLine && line.gstBp !== undefined && line.gstBp !== null) return line.gstBp;
  return draft.gstRateBp;
}

/**
 * The lines, priced in paise, or the first thing wrong. A line with nothing
 * in it is ignored, so "+ Aur kuch" never leaves a bill un-makeable; a line
 * with a description and no rate is a question, not a mistake to hide.
 */
export function checkBill(draft: BillFormDraft, opts: { needsCustomerName: boolean; chargesGst: boolean }): BillCheck {
  const taxed = opts.chargesGst && draft.gstOn;
  if (opts.needsCustomerName && !draft.customerName.trim())
    return { ok: false, problem: { field: 'customerName' }, message: say('error.required') };
  const filled = draft.lines.filter((l) => !isBlankLine(l));
  if (!filled.length) return { ok: false, problem: { field: 'lines' }, message: say('bill.check.empty') };
  const lines: CheckedLine[] = [];
  for (const line of filled) {
    if (!line.what.trim())
      return { ok: false, problem: { field: 'what', lineId: line.id }, message: say('error.required') };
    let quantityMilli: number;
    let unitPricePaise: number;
    try {
      quantityMilli = parseQuantity(line.qty || '1');
      if (quantityMilli <= 0) throw new MoneyError('zero');
    } catch {
      return { ok: false, problem: { field: 'qty', lineId: line.id }, message: say('error.qty') };
    }
    try {
      unitPricePaise = parseMoney(line.rate);
      if (unitPricePaise < 0) throw new MoneyError('negative');
    } catch {
      return { ok: false, problem: { field: 'rate', lineId: line.id }, message: say('error.amount') };
    }
    const rateBp = taxed ? lineRateBp(draft, line) : 0;
    lines.push({
      id: line.id,
      description: line.what.trim(),
      quantityMilli,
      unitPricePaise,
      discountPaise: 0,
      gstBp: rateBp ?? 0,
      // Without GST on this bill the rate is not a question; with it, the bill's select (or the line's own) must have been answered.
      taxRateChosen: !taxed || rateBp !== null,
      cessBp: 0,
      priceIncludesTax: false,
      unit: null,
      hsnCode: null,
    });
  }
  return { ok: true, lines };
}

/** Last time's lines, back into the three fields, for "Pichle jaisa hi?". */
export function linesToDraft(
  lines: readonly {
    description: string;
    quantityMilli: number;
    unitPricePaise: number;
    gstBp: number;
    taxRateChosen?: boolean;
  }[],
  newId: () => string,
): LineDraft[] {
  return lines.map((l) => ({
    id: newId(),
    what: l.description,
    qty: formatQuantityPlain(l.quantityMilli),
    rate: formatMoneyPlain(l.unitPricePaise).replace(/\.00$/, ''),
    gstBp: l.taxRateChosen === false ? null : l.gstBp,
  }));
}
/** Whether lines carry more than one rate, so the form opens with a rate on each line. */
export function hasMixedRates(lines: readonly LineDraft[]): boolean {
  return new Set(lines.map((l) => l.gstBp ?? null).filter((r) => r !== null)).size > 1;
}
/** "AMC visit + 2 fans": last time's bill in a few words, for the offer. */
export function summariseLines(lines: readonly { description: string; quantityMilli: number }[]): string {
  const parts = lines.slice(0, 3).map((l) => {
    const qty = l.quantityMilli === 1000 ? '' : `${formatQuantityPlain(l.quantityMilli)} `;
    return `${qty}${l.description}`.trim();
  });
  const more = lines.length > 3 ? ` + ${lines.length - 3}` : '';
  return parts.join(' + ') + more;
}
/** The running total as the owner types, before GST. Only the well-formed lines count. */
export function subtotalOf(lines: readonly LineDraft[]): number {
  let total = 0;
  for (const line of lines) {
    if (isBlankLine(line)) continue;
    try {
      const qty = parseQuantity(line.qty || '1');
      const rate = parseMoney(line.rate || '0');
      total += Math.round((qty * rate) / 1000);
    } catch {
      // Half-typed; counted once it makes sense.
    }
  }
  return total;
}
