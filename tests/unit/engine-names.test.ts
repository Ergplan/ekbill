import { describe, expect, it } from 'vitest';

import { findDuplicate, rateOddities } from '../../packages/engine/src/bill-guard';
import { dedupeWithin, matchExisting } from '../../packages/engine/src/import/match';
import { nameKey } from '../../packages/engine/src/names';
import { nameLikeness } from '../../packages/engine/src/read-bill';

/**
 * Stage 11 review: names were compared on [a-z0-9] only, so every name in Devanagari or Tamil became "" and
 * equal to every other: an import kept one and silently dropped the rest, any two Hindi-named walk-ins with the
 * same total looked like a duplicate bill, and a photo never matched a Hindi-named customer.
 */
describe('names in every script', () => {
  it('keep their letters and vowel signs, and lose case, spaces and punctuation', () => {
    expect(nameKey('शर्मा ट्रेडर्स')).toBe('शर्माट्रेडर्स');
    expect(nameKey('குமார் கடை')).toBe('குமார்கடை');
    expect(nameKey('  Mehta  Traders. ')).toBe('mehtatraders');
    expect(nameKey('—')).toBe('');
  });

  it('an import keeps every distinct customer, and still folds a true repeat', () => {
    const rows = [
      { name: 'शर्मा ट्रेडर्स', gstin: null },
      { name: 'वर्मा स्टोर', gstin: null },
      { name: 'குமார் கடை', gstin: null },
      { name: 'शर्मा  ट्रेडर्स', gstin: null },
      { name: '—', gstin: null },
      { name: '...', gstin: null },
    ];
    expect(dedupeWithin(rows).map((r) => r.name)).toEqual(['शर्मा ट्रेडर्स', 'वर्मा स्टोर', 'குமார் கடை', '—', '...']);
    expect(
      matchExisting({ name: 'वर्मा स्टोर', gstin: null, phone: null }, [
        { id: 'a', name: 'शर्मा ट्रेडर्स', gstin: null, phone: null },
      ]),
    ).toBeNull();
    expect(
      matchExisting({ name: 'वर्मा स्टोर', gstin: null, phone: null }, [
        { id: 'b', name: 'वर्मा स्टोर', gstin: null, phone: null },
      ]),
    ).toBe('b');
  });

  it('two walk-ins with different Hindi names are not a duplicate bill; the same name is', () => {
    const recent = [
      {
        id: 'x',
        number: 'INV-001',
        customerId: null,
        customerName: 'रमेश',
        totalPaise: 50000,
        issueDate: '2026-10-15',
        status: 'issued' as const,
      },
    ];
    expect(
      findDuplicate({ customerId: null, customerName: 'सुरेश', totalPaise: 50000, today: '2026-10-16' }, recent),
    ).toBeNull();
    expect(
      findDuplicate({ customerId: null, customerName: 'रमेश', totalPaise: 50000, today: '2026-10-16' }, recent),
    ).toMatchObject({ number: 'INV-001' });
  });

  it('a rate is compared with the same item, not with another Hindi-named one', () => {
    const last = [{ description: 'चावल', unitPricePaise: 5000 }];
    expect(rateOddities([{ what: 'दाल', qty: '1', rate: '500' } as never], last)).toEqual([]);
    expect(rateOddities([{ what: 'चावल', qty: '1', rate: '500' } as never], last)).toHaveLength(1);
  });

  it('a photographed name matches the customer it is', () => {
    expect(nameLikeness('शर्मा ट्रेडर्स', 'शर्मा ट्रेडर्स')).toBe(1);
    expect(nameLikeness('शर्मा ट्रेडर्स', 'வர்மா')).toBeLessThan(0.5);
  });
});
