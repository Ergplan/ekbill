import { describe, expect, it } from 'vitest';

import { findDuplicate, proportionalCredit, rateOddities, type RecentBill } from '../../packages/engine/src/bill-guard';

/** Salvaged from the MVP's tests/unit/bill-guard.test.ts (tag mvp-final); the numbering cases live in engine-numbering.test.ts. */
const issued = (id: string, customerId: string | null, name: string, issueDate: string, total: number): RecentBill => ({
  id,
  status: 'issued',
  number: `INV-${id}`,
  issueDate,
  customerId,
  customerName: name,
  totalPaise: total,
});

describe('yeh bill pehle ban chuka hai?', () => {
  const recent = [
    issued('41', 'c1', 'Mehta Traders', '2026-09-22', 620000),
    issued('35', 'c1', 'Mehta Traders', '2026-08-22', 620000),
    issued('42', 'c2', 'Priya', '2026-09-25', 620000),
  ];
  it('finds the same customer, same amount, within a week', () => {
    expect(
      findDuplicate(
        { customerId: 'c1', customerName: 'Mehta Traders', totalPaise: 620000, today: '2026-09-26' },
        recent,
      ),
    ).toMatchObject({ number: 'INV-41', issueDate: '2026-09-22' });
  });
  it('lets a month-old bill or a different amount through', () => {
    expect(
      findDuplicate(
        { customerId: 'c1', customerName: 'Mehta Traders', totalPaise: 620000, today: '2026-10-20' },
        recent,
      ),
    ).toBeNull();
    expect(
      findDuplicate(
        { customerId: 'c1', customerName: 'Mehta Traders', totalPaise: 620100, today: '2026-09-26' },
        recent,
      ),
    ).toBeNull();
  });
  it('matches a walk-in by name when there is no record', () => {
    const walkIn = [issued('50', null, 'Anil Kumar', '2026-09-25', 50000)];
    expect(
      findDuplicate({ customerId: null, customerName: 'anil kumar', totalPaise: 50000, today: '2026-09-26' }, walkIn)
        ?.number,
    ).toBe('INV-50');
  });
});

describe('rate check', () => {
  const last = [
    { description: 'AMC visit', unitPricePaise: 350000 },
    { description: 'Fan', unitPricePaise: 135000 },
  ];
  it('flags a missing or extra zero, not an ordinary change', () => {
    expect(rateOddities([{ id: '1', what: 'AMC visit', qty: '1', rate: '350' }], last)).toEqual([
      { what: 'AMC visit', lastRatePaise: 350000, nowRatePaise: 35000 },
    ]);
    expect(rateOddities([{ id: '1', what: 'amc  VISIT', qty: '1', rate: '35,000' }], last)).toHaveLength(1);
    expect(rateOddities([{ id: '1', what: 'AMC visit', qty: '1', rate: '3800' }], last)).toEqual([]);
    expect(rateOddities([{ id: '1', what: 'New thing', qty: '1', rate: '5' }], last)).toEqual([]);
  });
});

describe('a credit note against a GST bill', () => {
  it("reduces taxable value and each tax in the bill's proportion, and adds up", () => {
    const split = proportionalCredit(
      { totalPaise: 118000, cgstPaise: 9000, statePaise: 9000, igstPaise: 0, cessPaise: 0 },
      59000,
    );
    expect(split).toEqual({ taxablePaise: 50000, cgstPaise: 4500, statePaise: 4500, igstPaise: 0, cessPaise: 0 });
    expect(split.taxablePaise + split.cgstPaise + split.statePaise).toBe(59000);
  });
  it('is all taxable value on a bill without GST', () => {
    expect(
      proportionalCredit({ totalPaise: 205000, cgstPaise: 0, statePaise: 0, igstPaise: 0, cessPaise: 0 }, 5000),
    ).toMatchObject({ taxablePaise: 5000 });
  });
});
