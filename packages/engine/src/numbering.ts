import { financialYearOf, type CivilDate, type FinancialYear } from './dates';

/**
 * Document numbers (I3): per series, per financial year, gapless, never
 * reused. Salvaged from the MVP (src/server/repos/invoices.ts formatNumber,
 * src/lib/domain/bill-guard.ts previewNumber and suggestNumbering, tag
 * mvp-final): prefix, zero padding, the optional financial-year segment,
 * the next number only goes up, the sequence restarts at 1 when the
 * financial year rolls over. The allocation itself (SELECT … FOR UPDATE on
 * the series row) is packages/db/repos/documents.ts; this module is the
 * arithmetic and the words.
 */
export interface SeriesConfig {
  /** e.g. "INV-" or "SE/". Letters, digits, hyphen and slash; up to 10 characters. */
  prefix: string;
  /** Zero-padded width, e.g. 3 -> "001". 1..8. */
  padding: number;
  /** Whether the financial year goes in, e.g. "INV-2026-27/001". */
  includeFinancialYear: boolean;
  /** The next number to allocate within `financialYear`. */
  nextNumber: number;
  /** The financial year `nextNumber` belongs to ("2026-27"); null until the first document. */
  financialYear: FinancialYear | null;
}

/** Rule 46: a serial number is at most 16 characters of letters, digits, hyphens and slashes, unique per financial year. */
export const MAX_NUMBER_LENGTH = 16;
export const PREFIX_RE = /^[A-Za-z0-9/-]{0,10}$/;

export type SeriesProblem = 'prefix-characters' | 'prefix-length' | 'padding' | 'next-number' | 'too-long';

export function validateSeries(
  series: Pick<SeriesConfig, 'prefix' | 'padding' | 'includeFinancialYear' | 'nextNumber'>,
): SeriesProblem | null {
  if (!/^[A-Za-z0-9/-]*$/.test(series.prefix)) return 'prefix-characters';
  if (series.prefix.length > 10) return 'prefix-length';
  if (!Number.isInteger(series.padding) || series.padding < 1 || series.padding > 8) return 'padding';
  if (!Number.isInteger(series.nextNumber) || series.nextNumber < 1 || series.nextNumber > 99_999_999)
    return 'next-number';
  if (
    formatNumber(series, '2026-27', 99_999_999).length > MAX_NUMBER_LENGTH &&
    formatNumber(series, '2026-27', series.nextNumber).length > MAX_NUMBER_LENGTH
  )
    return 'too-long';
  return null;
}

/** "INV-" + "2026-27/" + "043" -> "INV-2026-27/043"; exactly as the MVP wrote it. */
export function formatNumber(
  series: Pick<SeriesConfig, 'prefix' | 'padding' | 'includeFinancialYear'>,
  fy: FinancialYear,
  sequence: number,
): string {
  const padded = String(sequence).padStart(series.padding, '0');
  return `${series.prefix}${series.includeFinancialYear ? `${fy}/` : ''}${padded}`;
}

/**
 * The number the next document will get on `issueDate`: the series' next; 1 when the year has rolled over to a
 * later one; and for a date in an earlier year than the series has reached (a paper bill photographed late),
 * one more than the highest number that year already has (`highestInEarlierYear`, read under the series lock):
 * that year's sequence continues, and the series stays where it is (`earlierYear`).
 */
export function nextNumberFor(
  series: SeriesConfig,
  issueDate: CivilDate,
  highestInEarlierYear: number | null = null,
): { financialYear: FinancialYear; sequence: number; number: string; rolledOver: boolean; earlierYear: boolean } {
  const fy = financialYearOf(issueDate);
  const earlierYear = series.financialYear !== null && fy < series.financialYear;
  const rolledOver = series.financialYear !== null && fy > series.financialYear;
  const sequence = earlierYear ? (highestInEarlierYear ?? 0) + 1 : rolledOver ? 1 : series.nextNumber;
  return { financialYear: fy, sequence, number: formatNumber(series, fy, sequence), rolledOver, earlierYear };
}

/** Whether a document dated `issueDate` falls in a year before the one the series has reached. */
export function isEarlierYear(series: SeriesConfig, issueDate: CivilDate): boolean {
  return series.financialYear !== null && financialYearOf(issueDate) < series.financialYear;
}

/** The sequence inside a number this series formatted for `fy` ("INV-2025-26/007" -> 7), or null if not its own. */
export function sequenceOf(
  series: Pick<SeriesConfig, 'prefix' | 'includeFinancialYear'>,
  fy: FinancialYear,
  number: string,
): number | null {
  const head = `${series.prefix}${series.includeFinancialYear ? `${fy}/` : ''}`;
  if (!number.startsWith(head)) return null;
  const rest = number.slice(head.length);
  return /^\d+$/.test(rest) ? Number(rest) : null;
}

/**
 * What the series looks like after allocating `allocated`: the next number only goes up, and a number given in an
 * earlier year leaves the series as it was.
 */
export function afterAllocation(
  series: SeriesConfig,
  allocated: { financialYear: FinancialYear; sequence: number; earlierYear?: boolean },
): SeriesConfig {
  if (allocated.earlierYear) return series;
  return { ...series, financialYear: allocated.financialYear, nextNumber: allocated.sequence + 1 };
}

/** The owner may move the next number up, never down below what was issued. */
export function canSetNextNumber(series: SeriesConfig, wanted: number, highestIssued: number): boolean {
  return (
    Number.isInteger(wanted) &&
    wanted >= 1 &&
    wanted > highestIssued &&
    wanted <= 99_999_999 &&
    (wanted >= series.nextNumber || highestIssued === 0)
  );
}

/** The number the next bill will get, for the form's subtitle. Mirrors nextNumberFor. */
export function previewNumber(series: SeriesConfig, issueDate: CivilDate): string {
  return nextNumberFor(series, issueDate).number;
}

/**
 * From the numbers on the old bills the owner uploaded, what the next one
 * should be: the same prefix, the year segment if they used one, and one
 * more than the highest. "INV/2025-26/042" -> INV/, with the year, 043.
 */
export function suggestNumbering(
  numbers: readonly (string | null | undefined)[],
): { series: Omit<SeriesConfig, 'financialYear'>; last: string } | null {
  const parsed = numbers
    .filter((n): n is string => typeof n === 'string' && /\d/.test(n))
    .map((raw) => {
      const m = /^(.*?)(\d+)\s*$/.exec(raw.trim());
      if (!m) return null;
      const seq = Number(m[2]);
      let prefix = m[1]!;
      const fyMatch = /(\d{4}-\d{2}|\d{2}-\d{2}|\d{4})[/-]$/.exec(prefix);
      const includeFinancialYear = Boolean(fyMatch);
      if (fyMatch) prefix = prefix.slice(0, -fyMatch[0].length);
      if (!PREFIX_RE.test(prefix)) return null;
      return { raw: raw.trim(), prefix, seq, padding: m[2]!.length, includeFinancialYear };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null && Number.isFinite(p.seq));
  if (!parsed.length) return null;
  const byPrefix = new Map<string, typeof parsed>();
  for (const p of parsed) byPrefix.set(p.prefix, [...(byPrefix.get(p.prefix) ?? []), p]);
  const [prefix, group] = [...byPrefix.entries()].sort((a, b) => b[1].length - a[1].length)[0]!;
  const top = [...group].sort((a, b) => b.seq - a.seq)[0]!;
  return {
    last: top.raw,
    series: {
      prefix,
      nextNumber: top.seq + 1,
      padding: Math.max(1, Math.min(8, top.padding)),
      includeFinancialYear: top.includeFinancialYear,
    },
  };
}
