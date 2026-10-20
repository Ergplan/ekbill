import { addDays, addMonths, compareDates, maxDate, type CivilDate } from './dates';

/**
 * EkBill's own fee (20 Oct, the operator): the first 20 bills free, then ₹20 a month paid by UPI; each friend who
 * joins by a business's link and issues a first bill gives that business one month at 25 % off. Pure: the
 * repository counts and lists, this decides. Change the rule here and nowhere else.
 */
export const PLAN = {
  freeBills: 20,
  monthlyPaise: 2000,
  /** Basis points off a month, per earned referral. */
  referralDiscountBp: 2500,
} as const;

export interface PlanPeriod {
  periodStart: CivilDate;
  periodEnd: CivilDate;
  status: 'claimed' | 'confirmed' | 'rejected';
}

export interface PlanFacts {
  /** Bills issued so far (credit notes and cancelled bills left out). */
  billsIssued: number;
  /** A complimentary period (the seed's businesses, a pilot): no fee until this date. */
  compUntil: CivilDate | null;
  payments: PlanPeriod[];
  /** Referrals earned and not yet used. */
  creditsLeft: number;
  today: CivilDate;
}

export type PlanState =
  | { kind: 'free'; freeLeft: number; canIssue: true }
  | { kind: 'comp'; until: CivilDate; canIssue: true }
  | { kind: 'paid'; until: CivilDate; claimed: boolean; canIssue: true }
  | { kind: 'due'; lapsedOn: CivilDate | null; canIssue: false };

/** Where a business stands today, and whether it may issue another bill. */
export function planState(f: PlanFacts): PlanState {
  if (f.compUntil && compareDates(f.today, f.compUntil) <= 0)
    return { kind: 'comp', until: f.compUntil, canIssue: true };
  const live = f.payments.filter((p) => p.status !== 'rejected');
  const covering = live.filter(
    (p) => compareDates(p.periodStart, f.today) <= 0 && compareDates(f.today, p.periodEnd) <= 0,
  );
  if (covering.length) {
    const until = paidUntil(live, f.today)!;
    return { kind: 'paid', until, claimed: covering.some((p) => p.status === 'claimed'), canIssue: true };
  }
  if (f.billsIssued < PLAN.freeBills) return { kind: 'free', freeLeft: PLAN.freeBills - f.billsIssued, canIssue: true };
  const ended = live.map((p) => p.periodEnd).sort();
  return { kind: 'due', lapsedOn: ended.length ? ended[ended.length - 1]! : null, canIssue: false };
}

/** The last day of the unbroken run of paid months that covers `from`, or null when none covers it. */
export function paidUntil(payments: PlanPeriod[], from: CivilDate): CivilDate | null {
  const live = payments
    .filter((p) => p.status !== 'rejected')
    .sort((a, b) => compareDates(a.periodStart, b.periodStart));
  let until: CivilDate | null = null;
  for (const p of live) {
    const reaches = until
      ? compareDates(p.periodStart, addDays(until, 1)) <= 0
      : compareDates(p.periodStart, from) <= 0;
    if (reaches && compareDates(p.periodEnd, from) >= 0) until = until ? maxDate(until, p.periodEnd) : p.periodEnd;
  }
  return until;
}

/** The next month a payment buys: from the day after what is paid (or today), one calendar month. */
export function nextPeriod(payments: PlanPeriod[], today: CivilDate): { periodStart: CivilDate; periodEnd: CivilDate } {
  const until = paidUntil(payments, today);
  const periodStart = until ? addDays(until, 1) : today;
  return { periodStart, periodEnd: addDays(addMonths(periodStart, 1), -1) };
}

/** What the next month costs: 25 % off when a referral is waiting to be used (one per month). */
export function priceOf(creditsLeft: number): { amountPaise: number; discountPaise: number } {
  const discountPaise = creditsLeft > 0 ? Math.round((PLAN.monthlyPaise * PLAN.referralDiscountBp) / 10_000) : 0;
  return { amountPaise: PLAN.monthlyPaise - discountPaise, discountPaise };
}

/** A UPI reference as the owner types it: 12 digits, spaces and dashes forgiven. */
export function utrOf(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[\s-]/g, '');
  return /^\d{12}$/.test(digits) ? digits : null;
}

/** The link a referral code makes, and the code from a link or as typed: six of A–Z and 2–9 (no 0/O, 1/I). */
export const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function referralCodeOf(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return /^[A-HJ-NP-Z2-9]{6}$/.test(code) ? code : null;
}
