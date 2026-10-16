import { compareDates, type CivilDate } from './dates';
import { say, type Say } from './say';

/**
 * What a customer still owes on a bill (Stage 6): one function, used by
 * every screen and every report, so the bill view, the dues list, Home and
 * the customer's folder can never disagree. Salvaged in spirit from the
 * MVP's payment lifecycle (tests/integration/payments.test.ts): payments
 * and adjustments ("Kam karo") reduce what is due, a reversal undoes the
 * entry it names, a credit note reduces the bill itself, a cancelled bill
 * owes nothing.
 */
export type LedgerKind = 'payment' | 'adjustment';
export const PAYMENT_METHODS = ['upi', 'cash', 'bank', 'cheque', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  amountPaise: number;
  /** Set when a later entry reversed this one: it no longer counts. */
  reversed: boolean;
}

export interface Balance {
  totalPaise: number;
  creditedPaise: number;
  paidPaise: number;
  adjustedPaise: number;
  duePaise: number;
  status: 'due' | 'partial' | 'paid' | 'cancelled';
}

export function balanceOf(args: {
  totalPaise: number;
  status: 'issued' | 'cancelled' | 'draft';
  entries: readonly LedgerEntry[];
  /** The totals of the credit notes issued against this bill. */
  creditNotesPaise?: readonly number[];
}): Balance {
  const live = args.entries.filter((e) => !e.reversed);
  const paidPaise = live.filter((e) => e.kind === 'payment').reduce((s, e) => s + e.amountPaise, 0);
  const adjustedPaise = live.filter((e) => e.kind === 'adjustment').reduce((s, e) => s + e.amountPaise, 0);
  const creditedPaise = (args.creditNotesPaise ?? []).reduce((s, n) => s + n, 0);
  if (args.status === 'cancelled')
    return { totalPaise: args.totalPaise, creditedPaise, paidPaise, adjustedPaise, duePaise: 0, status: 'cancelled' };
  const duePaise = Math.max(0, args.totalPaise - creditedPaise - paidPaise - adjustedPaise);
  const status: Balance['status'] = duePaise === 0 ? 'paid' : paidPaise + adjustedPaise > 0 ? 'partial' : 'due';
  return { totalPaise: args.totalPaise, creditedPaise, paidPaise, adjustedPaise, duePaise, status };
}

export type PaymentProblem = Say;

/** A payment or an adjustment the owner is about to record, against what is due on the bill. */
export function checkEntry(args: {
  kind: LedgerKind;
  amountPaise: number;
  duePaise: number;
  dateIso: CivilDate;
  issueDate: CivilDate;
  today: CivilDate;
  method?: string | null;
}): PaymentProblem | null {
  if (!Number.isSafeInteger(args.amountPaise) || args.amountPaise <= 0) return say('pay.error.amount');
  if (args.amountPaise > args.duePaise) return say('pay.error.more', { due: args.duePaise });
  if (compareDates(args.dateIso, args.today) > 0) return say('pay.error.future');
  if (compareDates(args.dateIso, args.issueDate) < 0) return say('pay.error.before');
  if (args.kind === 'payment' && !(PAYMENT_METHODS as readonly string[]).includes(args.method ?? ''))
    return say('pay.error.method');
  return null;
}

/** How many days a bill has been waiting, from its date to today (0 on the day). */
export function ageInDays(issueDate: CivilDate, today: CivilDate): number {
  const a = Date.UTC(Number(issueDate.slice(0, 4)), Number(issueDate.slice(5, 7)) - 1, Number(issueDate.slice(8, 10)));
  const b = Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export type ReminderTone = 'gentle' | 'direct' | 'second';
/** The tone to offer first: a second reminder once one went, direct after a month, gentle before. */
export function suggestedTone(args: { issueDate: CivilDate; today: CivilDate; remindersSent: number }): ReminderTone {
  if (args.remindersSent > 0) return 'second';
  return ageInDays(args.issueDate, args.today) > 30 ? 'direct' : 'gentle';
}
