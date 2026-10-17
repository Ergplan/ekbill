/**
 * The read-bill eval's bookkeeping, apart from the model calls so it can be tested (Stage 7 review): which set each
 * bill came from, counted from the bills actually run, and what a bill that could not be read still counts for, so
 * a failed read lowers the score instead of leaving the denominators.
 */
export interface Truth {
  name: string;
  customer: string | null;
  date: string | null;
  lines: Array<{ what: string; qty: number; rate: number; amount: number }>;
  total: number | null;
  legible?: boolean;
  found?: boolean;
}
export type Source = 'real' | 'synthetic';
export interface EvalBill {
  jpg: string;
  truth: Truth;
  source: Source;
}

/** The bills run: the real ones first, topped up with synthetic ones to `size` (or one set alone). */
export function chooseSet(
  real: readonly EvalBill[],
  synthetic: readonly EvalBill[],
  only: Source | null,
  size = 30,
): EvalBill[] {
  if (only === 'real') return [...real];
  if (only === 'synthetic') return [...synthetic];
  return [...real, ...synthetic.slice(0, Math.max(0, size - real.length))];
}

export function setCounts(run: readonly EvalBill[]): Record<Source, number> {
  return {
    real: run.filter((b) => b.source === 'real').length,
    synthetic: run.filter((b) => b.source === 'synthetic').length,
  };
}

/** What one bill counts for in the totals: the fields asked, its lines, whether it carries a total. */
export function denominatorsOf(truth: Truth): { fields: number; asked: number; lines: number; withTotal: number } {
  if (truth.legible === false || truth.found === false) return { fields: 1, asked: 0, lines: 0, withTotal: 0 };
  const fields = 2 + 4 * truth.lines.length;
  return { fields, asked: fields, lines: truth.lines.length, withTotal: truth.total !== null ? 1 : 0 };
}
