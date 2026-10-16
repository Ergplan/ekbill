/**
 * The GST of lines drafted again (a redo of a cancelled bill, "Pichle jaisa hi"): one rate when every line has the
 * same, each line its own when they differ. A bill with a 5 % and an 18 % line must not come back at 5 % on both.
 */
export function gstOfLines(
  rates: ReadonlyArray<number | null>,
  fallback: number,
): { mode: 'one' | 'perline'; rate: number; perLine: number[] } {
  const each = rates.map((r) => r ?? fallback);
  if (new Set(each).size > 1) return { mode: 'perline', rate: each[0]!, perLine: each };
  return { mode: 'one', rate: each[0] ?? fallback, perLine: [] };
}
