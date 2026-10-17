import { describe, expect, it } from 'vitest';

import {
  afterAllocation,
  canSetNextNumber,
  formatNumber,
  nextNumberFor,
  previewNumber,
  sequenceOf,
  suggestNumbering,
  validateSeries,
  type SeriesConfig,
} from '../../packages/engine/src/numbering';

/** The MVP's numbering behaviour (invoices.ts formatNumber, bill-guard previewNumber and suggestNumbering), kept as is (I3). */
const inv: SeriesConfig = {
  prefix: 'INV-',
  padding: 3,
  includeFinancialYear: false,
  nextNumber: 43,
  financialYear: '2026-27',
};

describe('bill numbers', () => {
  it('previews the next number the way the engine writes it', () => {
    expect(previewNumber(inv, '2026-10-15')).toBe('INV-043');
    expect(formatNumber({ prefix: 'SE/', padding: 2, includeFinancialYear: true }, '2026-27', 7)).toBe('SE/2026-27/07');
  });
  it('restarts at 1 when the financial year rolls over, and only goes up within a year', () => {
    const april = nextNumberFor(inv, '2027-04-01');
    expect(april).toEqual({
      financialYear: '2027-28',
      sequence: 1,
      number: 'INV-001',
      rolledOver: true,
      earlierYear: false,
    });
    const after = afterAllocation(inv, april);
    expect(after).toMatchObject({ financialYear: '2027-28', nextNumber: 2 });
    expect(nextNumberFor(after, '2027-04-02').number).toBe('INV-002');
    expect(nextNumberFor(inv, '2027-03-31')).toMatchObject({ sequence: 43, rolledOver: false });
    // A fresh series has no year yet: the first document sets it.
    expect(nextNumberFor({ ...inv, financialYear: null, nextNumber: 1 }, '2026-10-15')).toMatchObject({
      financialYear: '2026-27',
      sequence: 1,
      rolledOver: false,
    });
  });
  it('lets the owner move the next number up, never below an issued one', () => {
    expect(canSetNextNumber(inv, 50, 42)).toBe(true);
    expect(canSetNextNumber(inv, 40, 42)).toBe(false);
    expect(canSetNextNumber(inv, 0, 0)).toBe(false);
  });
  it('validates the series against Rule 46 (16 characters, letters, digits, hyphen, slash)', () => {
    expect(validateSeries({ prefix: 'INV-', padding: 3, includeFinancialYear: true, nextNumber: 1 }, 16)).toBeNull();
    expect(validateSeries({ prefix: 'INV #', padding: 3, includeFinancialYear: false, nextNumber: 1 }, 16)).toBe(
      'prefix-characters',
    );
    expect(validateSeries({ prefix: 'ABCDEFGHIJK', padding: 3, includeFinancialYear: false, nextNumber: 1 }, 16)).toBe(
      'prefix-length',
    );
    expect(validateSeries({ prefix: 'INV-', padding: 0, includeFinancialYear: false, nextNumber: 1 }, 16)).toBe(
      'padding',
    );
    expect(validateSeries({ prefix: 'INV-', padding: 3, includeFinancialYear: false, nextNumber: 0 }, 16)).toBe(
      'next-number',
    );
    expect(validateSeries({ prefix: 'ABCDEFGHIJ', padding: 8, includeFinancialYear: true, nextNumber: 1 }, 16)).toBe(
      'too-long',
    );
  });
  it('continues from the old bills that were uploaded', () => {
    expect(suggestNumbering(['INV/2025-26/041', 'INV/2025-26/042', 'INV/2025-26/040'])).toEqual({
      last: 'INV/2025-26/042',
      series: { prefix: 'INV/', nextNumber: 43, padding: 3, includeFinancialYear: true },
    });
    expect(suggestNumbering(['SE-7', 'SE-12', null, 'quote'])).toEqual({
      last: 'SE-12',
      series: { prefix: 'SE-', nextNumber: 13, padding: 2, includeFinancialYear: false },
    });
    expect(suggestNumbering([])).toBeNull();
    expect(suggestNumbering(['Bill number 4'])).toBeNull();
  });
});

// Found by the Stage 11 review: a date in an earlier year counted as a rollover, restarted at 1 and moved the
// series back a year, after which every new bill collided with a number already given.
describe('a document dated in an earlier year than the series has reached', () => {
  const fy: SeriesConfig = { ...inv, includeFinancialYear: true, nextNumber: 3, financialYear: '2026-27' };

  it("continues that year's sequence and leaves the series where it is", () => {
    const back = nextNumberFor(fy, '2026-03-20', 41);
    expect(back).toMatchObject({
      financialYear: '2025-26',
      sequence: 42,
      number: 'INV-2025-26/042',
      earlierYear: true,
    });
    expect(afterAllocation(fy, back)).toEqual(fy);
    // The next bill of this year is the one it would have been.
    expect(nextNumberFor(afterAllocation(fy, back), '2026-10-16').number).toBe('INV-2026-27/003');
  });

  it('starts that year at 1 when it has no number yet', () => {
    expect(nextNumberFor(fy, '2025-12-01', 0).number).toBe('INV-2025-26/001');
  });

  it('still restarts at 1 when the year moves forward', () => {
    expect(nextNumberFor(fy, '2027-04-01')).toMatchObject({
      number: 'INV-2027-28/001',
      rolledOver: true,
      earlierYear: false,
    });
  });

  it('reads the sequence back out of a number of its own, and only its own', () => {
    expect(sequenceOf(fy, '2025-26', 'INV-2025-26/042')).toBe(42);
    expect(sequenceOf(fy, '2025-26', 'INV-2026-27/042')).toBeNull();
    expect(sequenceOf(fy, '2025-26', 'AMC-2025-26/042')).toBeNull();
    expect(sequenceOf(inv, '2025-26', 'INV-1043')).toBe(1043);
  });
});
