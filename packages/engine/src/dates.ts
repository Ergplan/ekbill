/**
 * Civil-date arithmetic in Asia/Kolkata. Salvaged from the MVP
 * (src/lib/dates/index.ts, tag mvp-final) with its tests; the only change
 * is that todayIst() takes the instant (the engine is pure: no Date.now()).
 *
 * Every business date (invoice date, due date, period, return period) is a
 * CIVIL DATE "YYYY-MM-DD": a calendar day with no time and no zone. A JS
 * Date is an instant, and "what day is it?" of an instant depends on the
 * reader's zone; a server in UTC and an owner in Kolkata disagree for five
 * and a half hours of every day, long enough to file a bill into the wrong
 * month. So the instant becomes an IST civil date once, at the edge.
 * India has had a fixed +05:30 offset since 1945, so the fixed-offset
 * conversion is correct.
 */
export const IST_TIME_ZONE = 'Asia/Kolkata';
const IST_OFFSET_MINUTES = 330;

export type CivilDate = string;

export class DateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DateError';
  }
}

const CIVIL_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isCivilDate(value: unknown): value is CivilDate {
  if (typeof value !== 'string') return false;
  const m = CIVIL_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12) return false;
  return d >= 1 && d <= daysInMonth(y, mo);
}

export function assertCivilDate(value: unknown, what = 'date'): CivilDate {
  if (!isCivilDate(value)) throw new DateError(`${what} must be a valid YYYY-MM-DD date, received ${String(value)}`);
  return value;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month1to12: number): number {
  if (month1to12 < 1 || month1to12 > 12) throw new DateError(`month out of range: ${month1to12}`);
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month1to12 - 1]!;
}

export function makeCivilDate(year: number, month1to12: number, day: number): CivilDate {
  const max = daysInMonth(year, month1to12);
  if (day < 1 || day > max) throw new DateError(`day ${day} is out of range for ${year}-${month1to12}`);
  return `${String(year).padStart(4, '0')}-${String(month1to12).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function partsOf(date: CivilDate): { year: number; month: number; day: number } {
  const m = CIVIL_RE.exec(assertCivilDate(date));
  return { year: Number(m![1]), month: Number(m![2]), day: Number(m![3]) };
}

/** The civil date in Asia/Kolkata at the given instant. The caller passes the instant: the engine has no clock. */
export function todayIst(at: Date): CivilDate {
  const shifted = new Date(at.getTime() + IST_OFFSET_MINUTES * 60_000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

/** Midnight IST on the given civil date, as a UTC instant. */
export function istMidnightInstant(date: CivilDate): Date {
  const { year, month, day } = partsOf(date);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - IST_OFFSET_MINUTES * 60_000);
}

function toDayNumber(date: CivilDate): number {
  const { year, month, day } = partsOf(date);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}
function fromDayNumber(dayNumber: number): CivilDate {
  const d = new Date(dayNumber * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function addDays(date: CivilDate, days: number): CivilDate {
  return fromDayNumber(toDayNumber(date) + Math.trunc(days));
}
export function daysBetween(from: CivilDate, to: CivilDate): number {
  return toDayNumber(to) - toDayNumber(from);
}
export function compareDates(a: CivilDate, b: CivilDate): number {
  return assertCivilDate(a) < assertCivilDate(b) ? -1 : a > b ? 1 : 0;
}
export function maxDate(a: CivilDate, b: CivilDate): CivilDate {
  return compareDates(a, b) >= 0 ? a : b;
}
export function lastDayOfMonth(year: number, month1to12: number): CivilDate {
  return makeCivilDate(year, month1to12, daysInMonth(year, month1to12));
}

/**
 * Add whole months, CLAMPING the day to the length of the target month. With
 * `anchorDay` a schedule anchored to the 31st lands on 30 April, 28/29
 * February and returns to 31 May, because the anchor is re-applied each
 * period rather than the previous clamped result.
 */
export function addMonths(date: CivilDate, months: number, anchorDay?: number): CivilDate {
  const { year, month, day } = partsOf(date);
  const wanted = anchorDay ?? day;
  const totalMonths = year * 12 + (month - 1) + Math.trunc(months);
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;
  const clamped = Math.min(wanted, daysInMonth(targetYear, targetMonth));
  return makeCivilDate(targetYear, targetMonth, clamped);
}

// --- Month periods "YYYY-MM": billing periods and GST return periods -------
export type MonthPeriod = string;
const PERIOD_RE = /^(\d{4})-(\d{2})$/;

export function isMonthPeriod(value: unknown): value is MonthPeriod {
  if (typeof value !== 'string') return false;
  const m = PERIOD_RE.exec(value);
  if (!m) return false;
  const mo = Number(m[2]);
  return mo >= 1 && mo <= 12;
}
export function assertMonthPeriod(value: unknown, what = 'period'): MonthPeriod {
  if (!isMonthPeriod(value)) throw new DateError(`${what} must be YYYY-MM, received ${String(value)}`);
  return value;
}
export function monthPeriodOf(date: CivilDate): MonthPeriod {
  const { year, month } = partsOf(date);
  return `${year}-${String(month).padStart(2, '0')}`;
}
export function addMonthsToPeriod(period: MonthPeriod, months: number): MonthPeriod {
  const m = PERIOD_RE.exec(assertMonthPeriod(period))!;
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + Math.trunc(months);
  const y = Math.floor(total / 12);
  const mo = (total % 12) + 1;
  return `${y}-${String(mo).padStart(2, '0')}`;
}
export function periodBounds(period: MonthPeriod): { start: CivilDate; end: CivilDate } {
  const m = PERIOD_RE.exec(assertMonthPeriod(period))!;
  const year = Number(m[1]);
  const month = Number(m[2]);
  return { start: makeCivilDate(year, month, 1), end: lastDayOfMonth(year, month) };
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "2026-09" -> "September 2026" */
export function formatPeriodLong(period: MonthPeriod): string {
  const m = PERIOD_RE.exec(assertMonthPeriod(period))!;
  return `${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}`;
}
/** "2026-09-24" -> "24 Sep 2026": the format printed on invoices. */
export function formatDateShort(date: CivilDate): string {
  const { year, month, day } = partsOf(date);
  return `${String(day).padStart(2, '0')} ${MONTH_NAMES[month - 1]!.slice(0, 3)} ${year}`;
}
/** "24 September 2026" */
export function formatDateLong(date: CivilDate): string {
  const { year, month, day } = partsOf(date);
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

// --- Indian financial year: 1 April to 31 March, "2026-27" ------------------
export type FinancialYear = string;
const FY_RE = /^(\d{4})-(\d{2})$/;

export function financialYearOf(date: CivilDate): FinancialYear {
  const { year, month } = partsOf(date);
  return formatFinancialYear(month >= 4 ? year : year - 1);
}
export function formatFinancialYear(startYear: number): FinancialYear {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}
export function financialYearStartYear(fy: FinancialYear): number {
  const m = FY_RE.exec(fy);
  if (!m) throw new DateError(`invalid financial year: ${fy}`);
  return Number(m[1]);
}
export function financialYearBounds(fy: FinancialYear): { start: CivilDate; end: CivilDate } {
  const startYear = financialYearStartYear(fy);
  return { start: makeCivilDate(startYear, 4, 1), end: makeCivilDate(startYear + 1, 3, 31) };
}
export function isWithinFinancialYear(date: CivilDate, fy: FinancialYear): boolean {
  const { start, end } = financialYearBounds(fy);
  return compareDates(date, start) >= 0 && compareDates(date, end) <= 0;
}

/** The GST quarter a month period falls in (Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar), for QRMP taxpayers. */
export function gstQuarterOf(period: MonthPeriod): { quarter: 1 | 2 | 3 | 4; months: MonthPeriod[]; label: string } {
  const m = PERIOD_RE.exec(assertMonthPeriod(period))!;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const idx = Math.floor(((month - 4 + 12) % 12) / 3);
  const quarter = (idx + 1) as 1 | 2 | 3 | 4;
  const startMonth = ((idx * 3 + 3) % 12) + 1;
  const startYear = startMonth >= 4 ? (month >= 4 ? year : year - 1) : month >= 4 ? year + 1 : year;
  const months: MonthPeriod[] = [];
  let p: MonthPeriod = `${startYear}-${String(startMonth).padStart(2, '0')}`;
  for (let i = 0; i < 3; i += 1) {
    months.push(p);
    p = addMonthsToPeriod(p, 1);
  }
  const labels = ['Apr-Jun', 'Jul-Sep', 'Oct-Dec', 'Jan-Mar'];
  return { quarter, months, label: `${labels[idx]} ${financialYearOf(periodBounds(months[0]!).start)}` };
}
