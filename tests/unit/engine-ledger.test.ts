import { describe, expect, it } from 'vitest';

import { ageInDays, balanceOf, checkEntry, suggestedTone } from '../../packages/engine/src/index';

/** The one balance function (Stage 6): every screen and report asks it, so they can never disagree. */
describe('balanceOf', () => {
  const entry = (id: string, kind: 'payment' | 'adjustment', amountPaise: number, reversed = false) => ({
    id,
    kind,
    amountPaise,
    reversed,
  });
  it('is due until money comes, partial after some, paid at zero', () => {
    expect(balanceOf({ totalPaise: 1000, status: 'issued', entries: [] })).toMatchObject({
      duePaise: 1000,
      status: 'due',
    });
    expect(balanceOf({ totalPaise: 1000, status: 'issued', entries: [entry('a', 'payment', 400)] })).toMatchObject({
      duePaise: 600,
      status: 'partial',
    });
    expect(
      balanceOf({
        totalPaise: 1000,
        status: 'issued',
        entries: [entry('a', 'payment', 400), entry('b', 'adjustment', 600)],
      }),
    ).toMatchObject({ duePaise: 0, status: 'paid', adjustedPaise: 600 });
  });
  it('ignores a reversed entry, counts credit notes against the bill, and a cancelled bill owes nothing', () => {
    expect(
      balanceOf({ totalPaise: 1000, status: 'issued', entries: [entry('a', 'payment', 1000, true)] }),
    ).toMatchObject({ duePaise: 1000, status: 'due', paidPaise: 0 });
    expect(balanceOf({ totalPaise: 1000, status: 'issued', entries: [], creditNotesPaise: [300] })).toMatchObject({
      creditedPaise: 300,
      duePaise: 700,
      status: 'due',
    });
    expect(balanceOf({ totalPaise: 1000, status: 'issued', entries: [], creditNotesPaise: [1000] }).status).toBe(
      'paid',
    );
    expect(balanceOf({ totalPaise: 1000, status: 'cancelled', entries: [entry('a', 'payment', 200)] })).toMatchObject({
      duePaise: 0,
      status: 'cancelled',
    });
  });
  it('never goes below zero when more was credited than was left', () => {
    expect(
      balanceOf({ totalPaise: 1000, status: 'issued', entries: [entry('a', 'payment', 900)], creditNotesPaise: [500] })
        .duePaise,
    ).toBe(0);
  });
});

describe('checkEntry', () => {
  const ok = {
    kind: 'payment' as const,
    amountPaise: 100,
    duePaise: 500,
    dateIso: '2026-10-10',
    issueDate: '2026-10-01',
    today: '2026-10-15',
    method: 'upi',
  };
  it('accepts a payment within what is due, on a day between the bill and today', () => {
    expect(checkEntry(ok)).toBeNull();
    expect(checkEntry({ ...ok, kind: 'adjustment', method: null })).toBeNull();
  });
  it('says why it refuses, as dictionary keys', () => {
    expect(checkEntry({ ...ok, amountPaise: 0 })?.key).toBe('pay.error.amount');
    expect(checkEntry({ ...ok, amountPaise: 1.5 })?.key).toBe('pay.error.amount');
    expect(checkEntry({ ...ok, amountPaise: 501 })).toEqual({ key: 'pay.error.more', params: { due: 500 } });
    expect(checkEntry({ ...ok, dateIso: '2026-10-16' })?.key).toBe('pay.error.future');
    expect(checkEntry({ ...ok, dateIso: '2026-09-30' })?.key).toBe('pay.error.before');
    expect(checkEntry({ ...ok, method: 'barter' })?.key).toBe('pay.error.method');
  });
});

describe('ageing and the reminder tone', () => {
  it('counts whole days, never negative', () => {
    expect(ageInDays('2026-10-01', '2026-10-15')).toBe(14);
    expect(ageInDays('2026-10-15', '2026-10-15')).toBe(0);
    expect(ageInDays('2026-10-16', '2026-10-15')).toBe(0);
    expect(ageInDays('2026-02-28', '2026-03-01')).toBe(1);
  });
  it('offers gentle first, direct after a month, the second-reminder tone once one went', () => {
    expect(suggestedTone({ issueDate: '2026-10-01', today: '2026-10-15', remindersSent: 0 })).toBe('gentle');
    expect(suggestedTone({ issueDate: '2026-08-01', today: '2026-10-15', remindersSent: 0 })).toBe('direct');
    expect(suggestedTone({ issueDate: '2026-10-01', today: '2026-10-15', remindersSent: 1 })).toBe('second');
  });
});
