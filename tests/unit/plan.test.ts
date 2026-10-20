import { describe, expect, it } from 'vitest';

import { PLAN, nextPeriod, paidUntil, planState, priceOf, referralCodeOf, utrOf } from '@ekbill/engine';

/** EkBill's own fee (20 Oct): 20 bills free, then ₹20 a month by UPI; 25 % off a month per earned referral. */
const base = { billsIssued: 0, compUntil: null, payments: [], creditsLeft: 0, today: '2026-10-20' };
const month = (periodStart: string, periodEnd: string, status: 'claimed' | 'confirmed' | 'rejected' = 'confirmed') => ({
  periodStart,
  periodEnd,
  status,
});

describe('planState', () => {
  it('free for the first 20 bills, then due', () => {
    expect(planState({ ...base, billsIssued: 0 })).toEqual({ kind: 'free', freeLeft: 20, canIssue: true });
    expect(planState({ ...base, billsIssued: 19 })).toEqual({ kind: 'free', freeLeft: 1, canIssue: true });
    expect(planState({ ...base, billsIssued: 20 })).toEqual({ kind: 'due', lapsedOn: null, canIssue: false });
    expect(PLAN).toEqual({ freeBills: 20, monthlyPaise: 2000, referralDiscountBp: 2500 });
  });

  it('a paid month covers its days, end day included; a claimed one counts at once; a rejected one never', () => {
    const paid = [month('2026-10-05', '2026-11-04')];
    expect(planState({ ...base, billsIssued: 40, payments: paid })).toMatchObject({
      kind: 'paid',
      until: '2026-11-04',
    });
    expect(planState({ ...base, billsIssued: 40, payments: paid, today: '2026-11-04' }).canIssue).toBe(true);
    expect(planState({ ...base, billsIssued: 40, payments: paid, today: '2026-11-05' })).toEqual({
      kind: 'due',
      lapsedOn: '2026-11-04',
      canIssue: false,
    });
    expect(
      planState({ ...base, billsIssued: 40, payments: [month('2026-10-05', '2026-11-04', 'claimed')] }),
    ).toMatchObject({ kind: 'paid', claimed: true });
    expect(
      planState({ ...base, billsIssued: 40, payments: [month('2026-10-05', '2026-11-04', 'rejected')] }).canIssue,
    ).toBe(false);
  });

  it('a complimentary period wins while it lasts', () => {
    expect(planState({ ...base, billsIssued: 500, compUntil: '2099-12-31' })).toEqual({
      kind: 'comp',
      until: '2099-12-31',
      canIssue: true,
    });
    expect(planState({ ...base, billsIssued: 500, compUntil: '2026-10-19' }).canIssue).toBe(false);
  });
});

describe('periods and price', () => {
  it('the next month starts the day after what is paid, or today; months back to back run on', () => {
    expect(nextPeriod([], '2026-10-20')).toEqual({ periodStart: '2026-10-20', periodEnd: '2026-11-19' });
    const one = [month('2026-10-20', '2026-11-19')];
    expect(nextPeriod(one, '2026-10-25')).toEqual({ periodStart: '2026-11-20', periodEnd: '2026-12-19' });
    const two = [...one, month('2026-11-20', '2026-12-19', 'claimed')];
    expect(paidUntil(two, '2026-10-25')).toBe('2026-12-19');
    // A lapsed month is not paid time: the next one starts today.
    expect(nextPeriod(one, '2027-01-05')).toEqual({ periodStart: '2027-01-05', periodEnd: '2027-02-04' });
    // 31 January: the month clamps to the end of February.
    expect(nextPeriod([], '2027-01-31')).toEqual({ periodStart: '2027-01-31', periodEnd: '2027-02-27' });
  });

  it('₹20 a month; ₹15 when a referral is waiting (one per month)', () => {
    expect(priceOf(0)).toEqual({ amountPaise: 2000, discountPaise: 0 });
    expect(priceOf(1)).toEqual({ amountPaise: 1500, discountPaise: 500 });
    expect(priceOf(3)).toEqual({ amountPaise: 1500, discountPaise: 500 });
  });

  it('a UPI reference is 12 digits; a referral code six of A–Z and 2–9', () => {
    expect(utrOf('6123 4567 8901')).toBe('612345678901');
    expect(utrOf('61234567890')).toBeNull();
    expect(utrOf(612345678901)).toBeNull();
    expect(referralCodeOf(' ab3k9z ')).toBe('AB3K9Z');
    for (const bad of ['AB3K9', 'AB3K9Z1', 'AB0K9Z', 'ABIK9Z', null]) expect(referralCodeOf(bad)).toBeNull();
  });
});
