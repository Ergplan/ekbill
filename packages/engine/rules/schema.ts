// trace: not-input -- validates the rule pack files, not anything a person types.
import { z } from 'zod';

/**
 * The shape of every rule pack file (I5). rules:check validates each file
 * against this; the engine's loaders narrow by `kind`. Every entry carries
 * its window, its official source, the phrases rules:verify looks for on
 * that page, a two-register explanation (explain(ruleId)), and the record
 * of its last verification.
 */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

export const ruleEntrySchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    kind: z.enum([
      'selectable-rates',
      'note',
      'document-kinds',
      'document-fields',
      'threshold',
      'hsn-digits',
      'reporting-window',
      'composition',
      'place-of-supply',
      'place-of-supply-cases',
      'due-date',
      'portal-lock',
      'deadline',
    ]),
    effectiveFrom: isoDate,
    effectiveTo: isoDate.nullable(),
    source: z.string().url(),
    verify: z.object({ mustContain: z.array(z.string().min(2)).min(1) }),
    explain: z.object({ en: z.string().min(10), 'hi-Latn': z.string().min(10) }),
    verified: z.boolean(),
    verifiedOn: isoDate,
    verifiedBy: z.string().min(3),
  })
  .passthrough();

export const rulePackSchema = z.object({
  _note: z.string(),
  version: z.string().min(3),
  effectiveFrom: isoDate,
  entries: z.array(ruleEntrySchema).min(1),
});

/** Kind-specific fields the engine reads; checked on top of the base shape. */
export const kindSchemas: Record<string, z.ZodTypeAny> = {
  'selectable-rates': z.object({ ratesPercent: z.array(z.number().nonnegative()).min(1) }).passthrough(),
  'document-kinds': z
    .object({ kinds: z.record(z.string(), z.enum(['tax-invoice', 'bill-of-supply', 'invoice'])) })
    .passthrough(),
  threshold: z.object({ thresholdPaise: z.number().int().positive() }).passthrough(),
  'hsn-digits': z
    .object({
      bands: z
        .array(
          z.object({
            turnoverUpToPaise: z.number().int().positive().nullable(),
            b2bDigits: z.number().int(),
            b2cDigits: z.number().int(),
          }),
        )
        .min(1),
      sacDigits: z.number().int(),
      sacPrefix: z.string(),
    })
    .passthrough(),
  'reporting-window': z
    .object({ thresholdPaise: z.number().int().positive(), days: z.number().int().positive() })
    .passthrough(),
  composition: z
    .object({
      goodsLimitPaise: z.number().int().positive(),
      specialStatesLimitPaise: z.number().int().positive(),
      servicesLimitPaise: z.number().int().positive(),
      canCollectTax: z.boolean(),
      legend: z.string().min(5),
      specialStates: z.array(z.string()),
    })
    .passthrough(),
  'place-of-supply': z
    .object({
      decide: z.object({
        sameState: z.enum(['intra', 'inter']),
        otherState: z.enum(['intra', 'inter']),
        unknownState: z.enum(['intra', 'inter']),
      }),
    })
    .passthrough(),
  'due-date': z
    .object({ form: z.enum(['GSTR-1', 'GSTR-3B']), frequency: z.enum(['monthly', 'quarterly']) })
    .passthrough(),
  deadline: z
    .object({ monthDay: z.string().regex(/^\d{2}-\d{2}$/), yearsAfterFinancialYear: z.number().int() })
    .passthrough(),
};

export const hsnIndexSchema = z.object({
  _note: z.string(),
  version: z.string(),
  sources: z.array(z.object({ what: z.string(), url: z.string().url() })).min(1),
  fetchedOn: isoDate,
  fetched: z.boolean(),
  hsnChapters: z.array(z.object({ chapter: z.string().regex(/^\d{2}$/), heading: z.string().min(3) })).min(90),
  sacHeadings: z.array(z.object({ code: z.string().regex(/^99\d{2}$/), heading: z.string().min(3) })).min(20),
});

export type RuleEntryJson = z.infer<typeof ruleEntrySchema>;
export type RulePackJson = z.infer<typeof rulePackSchema>;
