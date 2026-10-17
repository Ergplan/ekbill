import { describe, expect, it } from 'vitest';

import {
  GST_RULES,
  RuleError,
  compositionRule,
  creditNoteDeadline,
  documentKind,
  explain,
  hsnDigitsFor,
  irnReportingWindow,
  maxNumberLengthOn,
  placeOfSupply,
  returnDueDate,
  ruleOn,
  rulesOn,
  selectableRates,
  thresholdOn,
  unverifiedRules,
  type RuleKind,
} from '../../packages/engine/src/rules';

/**
 * A fixture per rule entry (I5): a date inside its window where the entry
 * decides, and a date outside it where it does not. The table is the
 * pack's table of contents; adding an entry without a fixture fails the
 * first test.
 */
interface Fixture {
  id: string;
  kind: RuleKind;
  inside: string;
  outside: string;
  /** What the accessor says on the inside date, and what it says outside. */
  decides: () => void;
}

const FIXTURES: Fixture[] = [
  {
    id: 'selectable-rates-2017',
    kind: 'selectable-rates',
    inside: '2025-09-21',
    outside: '2025-09-22',
    decides: () => {
      expect(selectableRates('2025-09-21')).toEqual([0, 5, 12, 18, 28]);
      expect(selectableRates('2017-07-01')).toEqual([0, 5, 12, 18, 28]);
      expect(selectableRates('2025-09-22')).not.toContain(12);
    },
  },
  {
    id: 'selectable-rates-gst2',
    kind: 'selectable-rates',
    inside: '2025-09-22',
    outside: '2025-09-21',
    decides: () => {
      expect(selectableRates('2025-09-22')).toEqual([0, 5, 18, 40]);
      expect(selectableRates('2026-10-15')).toEqual([0, 5, 18, 40]);
      expect(selectableRates('2025-09-21')).not.toContain(40);
    },
  },
  {
    id: 'council-57-no-change',
    kind: 'note',
    inside: '2026-10-08',
    outside: '2026-10-07',
    decides: () => {
      // A note changes nothing: the rates either side of its date agree.
      expect(selectableRates('2026-10-07')).toEqual(selectableRates('2026-10-08'));
      expect(ruleOn('note', '2026-10-08')?.id).toBe('council-57-no-change');
      expect(ruleOn('note', '2026-10-07')).toBeNull();
    },
  },
  {
    id: 'document-kinds-2017',
    kind: 'document-kinds',
    inside: '2017-07-01',
    outside: '2017-06-30',
    decides: () => {
      expect(documentKind('regular', true, '2017-07-01')).toBe('tax-invoice');
      // GST off on one bill: a bill of supply (s. 31(3)(c)), not a plain invoice (fourth review).
      expect(documentKind('regular', false, '2017-07-01')).toBe('bill-of-supply');
      expect(documentKind('composition', true, '2017-07-01')).toBe('bill-of-supply');
      expect(() => documentKind('regular', true, '2017-06-30')).toThrow(RuleError);
    },
  },
  {
    id: 'tax-invoice-fields-r46',
    kind: 'document-fields',
    inside: '2026-10-15',
    outside: '2017-06-30',
    decides: () => {
      const e = rulesOn('document-fields', '2026-10-15').find((x) => x.id === 'tax-invoice-fields-r46')!;
      expect(e.maxNumberLength).toBe(16);
      expect(maxNumberLengthOn('2026-10-15')).toBe(16);
      expect(e.document).toBe('tax-invoice');
    },
  },
  {
    id: 'b2c-recipient-details-r46',
    kind: 'threshold',
    inside: '2026-10-15',
    outside: '2017-06-30',
    decides: () => {
      expect(thresholdOn('b2c-recipient-details', '2026-10-15')).toMatchObject({
        thresholdPaise: 5000000,
        ruleId: 'b2c-recipient-details-r46',
      });
      expect(thresholdOn('b2c-recipient-details', '2017-06-30')).toBeNull();
    },
  },
  {
    id: 'bill-of-supply-r49',
    kind: 'document-fields',
    inside: '2026-10-15',
    outside: '2017-06-30',
    decides: () => {
      const e = rulesOn('document-fields', '2026-10-15').find((x) => x.id === 'bill-of-supply-r49')!;
      expect(e.compositionLegend).toContain('not eligible to collect tax');
    },
  },
  {
    id: 'credit-note-fields-r53',
    kind: 'document-fields',
    inside: '2026-10-15',
    outside: '2017-06-30',
    decides: () => {
      const e = rulesOn('document-fields', '2026-10-15').find((x) => x.id === 'credit-note-fields-r53')!;
      expect((e as { fields?: string[] }).fields).toContain('linkedInvoice.number');
    },
  },
  {
    id: 'gstr1-b2c-large-2017',
    kind: 'threshold',
    inside: '2024-10-31',
    outside: '2024-11-01',
    decides: () => {
      expect(thresholdOn('gstr1-b2c-large', '2024-10-31')).toMatchObject({
        thresholdPaise: 25000000,
        ruleId: 'gstr1-b2c-large-2017',
      });
    },
  },
  {
    id: 'gstr1-b2c-large-2024',
    kind: 'threshold',
    inside: '2024-11-01',
    outside: '2024-10-31',
    decides: () => {
      expect(thresholdOn('gstr1-b2c-large', '2024-11-01')).toMatchObject({
        thresholdPaise: 10000000,
        ruleId: 'gstr1-b2c-large-2024',
      });
      expect(thresholdOn('gstr1-b2c-large', '2026-10-15')?.thresholdPaise).toBe(10000000);
    },
  },
  {
    id: 'e-invoice-threshold-2023',
    kind: 'threshold',
    inside: '2023-08-01',
    outside: '2023-07-31',
    decides: () => {
      expect(thresholdOn('e-invoice', '2023-08-01')).toMatchObject({ thresholdPaise: 5000000000 });
      expect(thresholdOn('e-invoice', '2023-08-01')!.entry.exemptions).toContain('bank');
      expect(thresholdOn('e-invoice', '2023-07-31')).toBeNull();
    },
  },
  {
    id: 'irn-30-day-2025',
    kind: 'reporting-window',
    inside: '2025-04-01',
    outside: '2025-03-31',
    decides: () => {
      expect(irnReportingWindow(10000000000, '2025-04-01')).toEqual({ days: 30, ruleId: 'irn-30-day-2025' });
      expect(irnReportingWindow(9999999999, '2025-04-01')).toBeNull();
      expect(irnReportingWindow(null, '2025-04-01')).toBeNull();
      expect(irnReportingWindow(10000000000, '2025-03-31')).toBeNull();
    },
  },
  {
    id: 'hsn-digits-2021',
    kind: 'hsn-digits',
    inside: '2021-04-01',
    outside: '2021-03-31',
    decides: () => {
      expect(hsnDigitsFor(null, '2021-04-01')).toMatchObject({ b2b: 4, b2c: 0, sacDigits: 6, sacPrefix: '99' });
      expect(hsnDigitsFor(5000000000, '2021-04-01')).toMatchObject({ b2b: 4, b2c: 0 });
      expect(hsnDigitsFor(5000000001, '2021-04-01')).toMatchObject({ b2b: 6, b2c: 6 });
      expect(hsnDigitsFor(null, '2021-03-31')).toBeNull();
    },
  },
  {
    id: 'place-of-supply-state',
    kind: 'place-of-supply',
    inside: '2017-07-01',
    outside: '2017-06-30',
    decides: () => {
      expect(placeOfSupply('27', '27', '2017-07-01')).toEqual({
        supply: 'intra',
        stateHead: 'SGST',
        ruleId: 'place-of-supply-state',
      });
      expect(placeOfSupply('27', '23', '2017-07-01').supply).toBe('inter');
      expect(placeOfSupply('27', null, '2017-07-01').supply).toBe('intra');
      expect(() => placeOfSupply('27', '27', '2017-06-30')).toThrow(RuleError);
    },
  },
  {
    id: 'place-of-supply-cases',
    kind: 'place-of-supply-cases',
    inside: '2026-10-15',
    outside: '2017-06-30',
    decides: () => {
      expect(ruleOn('place-of-supply-cases', '2026-10-15')?.cases).toMatchObject({
        b2b: 'recipient-state',
        b2cServicesPropertyOrEvent: 'ask',
      });
      expect(ruleOn('place-of-supply-cases', '2017-06-30')).toBeNull();
    },
  },
  {
    id: 'composition-limits-2019',
    kind: 'composition',
    inside: '2019-04-01',
    outside: '2019-03-31',
    decides: () => {
      const c = compositionRule('2019-04-01')!;
      expect(c).toMatchObject({
        goodsLimitPaise: 1500000000,
        specialStatesLimitPaise: 750000000,
        servicesLimitPaise: 500000000,
        canCollectTax: false,
      });
      expect(c.specialStates).toContain('11');
      expect(c.legend).toBeTruthy();
      expect(compositionRule('2019-03-31')).toBeNull();
    },
  },
  {
    id: 'credit-note-declare-limit',
    kind: 'deadline',
    inside: '2017-07-01',
    outside: '2017-06-30',
    decides: () => {
      // FY 2026-27 (invoice in May 2026): 30 November after that FY ends.
      expect(creditNoteDeadline('2026-05-10')).toEqual({
        dateIso: '2027-11-30',
        orAnnualReturn: true,
        ruleId: 'credit-note-declare-limit',
      });
      // FY 2025-26 (invoice in February 2026).
      expect(creditNoteDeadline('2026-02-10')?.dateIso).toBe('2026-11-30');
      expect(creditNoteDeadline('2017-06-30')).toBeNull();
    },
  },
  {
    id: 'gstr1-monthly-due',
    kind: 'due-date',
    inside: '2026-09-28',
    outside: '2017-06-30',
    decides: () => {
      expect(returnDueDate('GSTR-1', 'monthly', '2026-09', '27')).toEqual({
        dateIso: '2026-10-11',
        ruleId: 'gstr1-monthly-due',
      });
      expect(returnDueDate('GSTR-1', 'monthly', '2026-12', null)?.dateIso).toBe('2027-01-11');
      expect(returnDueDate('GSTR-1', 'monthly', '2017-06', null)).toBeNull();
    },
  },
  {
    id: 'gstr1-quarterly-due',
    kind: 'due-date',
    inside: '2026-09-28',
    outside: '2020-12-28',
    decides: () => {
      expect(returnDueDate('GSTR-1', 'quarterly', '2026-09', '27')).toEqual({
        dateIso: '2026-10-13',
        ruleId: 'gstr1-quarterly-due',
      });
      expect(returnDueDate('GSTR-1', 'quarterly', '2020-12', '27')).toBeNull();
    },
  },
  {
    id: 'gstr3b-monthly-due',
    kind: 'due-date',
    inside: '2026-09-28',
    outside: '2017-06-30',
    decides: () => {
      expect(returnDueDate('GSTR-3B', 'monthly', '2026-09', '27')).toEqual({
        dateIso: '2026-10-20',
        ruleId: 'gstr3b-monthly-due',
      });
      expect(returnDueDate('GSTR-3B', 'monthly', '2017-06', null)).toBeNull();
    },
  },
  {
    id: 'gstr3b-quarterly-due',
    kind: 'due-date',
    inside: '2026-09-28',
    outside: '2020-12-28',
    decides: () => {
      // Maharashtra is in group A (22nd); Uttar Pradesh is not (24th).
      expect(returnDueDate('GSTR-3B', 'quarterly', '2026-09', '27')?.dateIso).toBe('2026-10-22');
      expect(returnDueDate('GSTR-3B', 'quarterly', '2026-09', '09')?.dateIso).toBe('2026-10-24');
      // Chhattisgarh, Madhya Pradesh and Andaman & Nicobar are in group A too (Notification 76/2020).
      for (const s of ['22', '23', '35'])
        expect(returnDueDate('GSTR-3B', 'quarterly', '2026-09', s)?.dateIso).toBe('2026-10-22');
      // Delhi, Punjab and West Bengal are in group B.
      for (const s of ['07', '03', '19'])
        expect(returnDueDate('GSTR-3B', 'quarterly', '2026-09', s)?.dateIso).toBe('2026-10-24');
      expect(returnDueDate('GSTR-3B', 'quarterly', '2026-09', null)?.dateIso).toBe('2026-10-24');
      expect(returnDueDate('GSTR-3B', 'quarterly', '2020-12', '27')).toBeNull();
    },
  },
  {
    id: 'gstr3b-outward-locked-2025',
    kind: 'portal-lock',
    inside: '2025-07-01',
    outside: '2025-06-30',
    decides: () => {
      const e = rulesOn('portal-lock', '2025-07-01').find((x) => x.id === 'gstr3b-outward-locked-2025')!;
      expect(e.locks).toEqual(['3b.outward']);
      expect(rulesOn('portal-lock', '2025-06-30')).toEqual([]);
    },
  },
  {
    id: 'filing-limit-3-years',
    kind: 'portal-lock',
    inside: '2025-07-01',
    outside: '2025-06-30',
    decides: () => {
      const e = rulesOn('portal-lock', '2025-07-01').find((x) => x.id === 'filing-limit-3-years')!;
      expect(e.years).toBe(3);
    },
  },
];

describe('the rule pack (I5): one fixture per entry', () => {
  it('covers every entry in the pack, and nothing that is not in it', () => {
    expect(FIXTURES.map((f) => f.id).sort()).toEqual(GST_RULES.entries.map((e) => e.id).sort());
    expect(new Set(GST_RULES.entries.map((e) => e.id)).size).toBe(GST_RULES.entries.length);
  });

  it('names the eight files it is read from, with a version each', () => {
    expect(Object.keys(GST_RULES.files).sort()).toEqual([
      'composition.json',
      'credit-note-limits.json',
      'document-types.json',
      'e-invoice.json',
      'hsn.json',
      'place-of-supply.json',
      'rates.json',
      'returns-calendar.json',
    ]);
    expect(GST_RULES.version).toMatch(/^\d{4}\.\d{2}\.\d{2}/);
    for (const v of Object.values(GST_RULES.files)) expect(v).toMatch(/^\d{4}\.\d{2}\.\d{2}/);
  });

  describe.each(FIXTURES)('$id', (f) => {
    const entry = GST_RULES.entries.find((e) => e.id === f.id)!;
    it('is in force on the inside date and not on the outside date', () => {
      expect(entry.kind).toBe(f.kind);
      expect(rulesOn(f.kind, f.inside).map((e) => e.id)).toContain(f.id);
      expect(rulesOn(f.kind, f.outside).map((e) => e.id)).not.toContain(f.id);
    });
    it('explains itself in both registers and cites an official source', () => {
      const x = explain(f.id)!;
      expect(x.en.length).toBeGreaterThan(20);
      expect(x['hi-Latn'].length).toBeGreaterThan(20);
      expect(x.source).toMatch(/^https:\/\/[^ ]+\.(gov\.in|nic\.in)/);
      expect(entry.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.verifiedBy.length).toBeGreaterThan(0);
    });
    it('decides what it says it decides', f.decides);
  });

  it('lists what is still unverified, so the report can say so', () => {
    const list = unverifiedRules();
    expect(list.map((u) => u.id).sort()).toEqual(
      GST_RULES.entries
        .filter((e) => !e.verified)
        .map((e) => e.id)
        .sort(),
    );
    for (const u of list) expect(u.source).toMatch(/^https:/);
  });

  it('says nothing about an id it does not know', () => {
    expect(explain('no-such-rule')).toBeNull();
  });
});

describe('values the code reads from the pack, never stands in for (I5, Stage 3 review)', () => {
  const withEntry = (id: string, patch: Record<string, unknown>) => ({
    ...GST_RULES,
    entries: GST_RULES.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
  });
  it('the longest number is the pack’s: at 12, INV-2026-27/001 is too long', async () => {
    const { validateSeries } = await import('../../packages/engine/src/numbering');
    const pack = withEntry('tax-invoice-fields-r46', { maxNumberLength: 12 });
    expect(maxNumberLengthOn('2026-10-15', pack)).toBe(12);
    const series = { prefix: 'INV-', padding: 3, includeFinancialYear: true, nextNumber: 1 };
    expect(validateSeries(series, maxNumberLengthOn('2026-10-15', pack))).toBe('too-long');
    expect(validateSeries(series, maxNumberLengthOn('2026-10-15'))).toBeNull();
  });
  it('an entry without its value is a rule error, not a default', () => {
    expect(() =>
      maxNumberLengthOn('2026-10-15', withEntry('tax-invoice-fields-r46', { maxNumberLength: undefined })),
    ).toThrow(RuleError);
    const due = GST_RULES.entries.find(
      (e) => e.kind === 'due-date' && e.frequency === 'monthly' && e.form === 'GSTR-3B',
    );
    if (due) {
      const pack = withEntry(due.id, { dayOfNextMonth: undefined });
      expect(() => returnDueDate('GSTR-3B', 'monthly', '2026-09', '27', pack)).toThrow(RuleError);
    }
  });
});
