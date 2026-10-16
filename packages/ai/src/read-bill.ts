import { z } from 'zod';

/**
 * The read-bill answer, as the prompt asks for it (prompts/read-bill/v1.md).
 * Lenient where models vary harmlessly (numbers as strings or numbers,
 * missing optional fields), strict where it matters: a malformed answer is
 * an "invalid" reading, never a crash and never a guess.
 */
const field = z
  .object({
    value: z.union([z.string(), z.number(), z.null()]).transform((v) => (v === null ? null : String(v))),
    confidence: z.coerce.number().min(0).max(1),
    unreadable: z.boolean().optional().default(false),
  })
  .transform((f) => ({ value: f.value, confidence: f.confidence, unreadable: f.unreadable }));
const optionalField = field.optional();

export const readBillAnswer = z.object({
  legible: z.boolean(),
  found: z.boolean(),
  customer: field,
  phone: optionalField,
  date: field,
  lines: z
    .array(
      z.object({
        what: field,
        qty: field,
        unit: optionalField,
        rate: field,
        amount: field,
        hsn: optionalField,
      }),
    )
    .max(60),
  total: field,
  notes: z.string().max(500).nullable().optional(),
});
export type ReadBillAnswer = z.infer<typeof readBillAnswer>;
