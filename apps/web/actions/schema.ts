import { z } from 'zod';

/**
 * Inputs of the server actions, validated at the boundary (CLAUDE.md:
 * actions validate input, call a repository, return ActionResult). The
 * field trace (scripts/trace.mjs) reads these: each field maps to the
 * column of the same name in the table named below.
 */
// table: users
export const themeInput = z.object({
  theme: z.enum(['narangi', 'harmony', 'system']),
});
// table: users
export const languageInput = z.object({
  language: z.enum(['hi-Latn', 'en']),
});
// table: users
export const nameInput = z.object({
  name: z.string().trim().min(1).max(80),
});

// table: businesses
/** The whole profile as the setup and Aap send it (checked again by the engine in the repository). */
export const profileInput = z.object({
  legalName: z.string().trim().min(1).max(120),
  tradeName: z.string().trim().max(120).nullable().optional(),
  /** The setup answer (yes | composition | no | unknown) or the stored type; the engine maps it to registrationType. */
  gst: z.enum(['yes', 'composition', 'no', 'unknown', 'regular', 'not-registered', 'not-sure']),
  gstin: z.string().trim().max(15).nullable().optional(),
  pan: z.string().trim().max(10).nullable().optional(),
  turnoverBand: z.enum(['40l', '40l-1.5cr', '1.5-5cr', '5cr+']).nullable().optional(),
  eInvoicingApplies: z.boolean().nullable().optional(),
  compositionLegend: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  email: z.string().trim().max(120).nullable().optional(),
  upi: z.string().trim().max(80).nullable().optional(),
  address: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  pincode: z.string().trim().max(10).nullable().optional(),
  stateCode: z.string().trim().max(2).nullable().optional(),
  bankName: z.string().trim().max(80).nullable().optional(),
  bankAccount: z.string().trim().max(24).nullable().optional(),
  bankIfsc: z.string().trim().max(11).nullable().optional(),
  bankHolder: z.string().trim().max(120).nullable().optional(),
  defaultPaymentTermsDays: z.number().int().min(0).max(365).nullable().optional(),
  voiceOnArrival: z.boolean().nullable().optional(),
});
// table: businesses
export const lookInput = z.object({
  billDesign: z.enum(['classic', 'modern', 'simple']).optional(),
  billPaper: z.enum(['a4', 'a5', '80mm', '58mm']).optional(),
  billShareAs: z.enum(['pdf', 'jpg']).optional(),
  billAccent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});
// table: business_files
export const fileInput = z.object({
  kind: z.enum(['logo', 'signature']),
  /** A data URL (image/png, jpeg or webp; the engine holds the byte caps), or null to take the file off the bills. */
  dataUrl: z.string().max(420_000).nullable(),
});
// table: series
export const seriesInput = z.object({
  name: z.string().trim().min(1).max(40),
  kind: z.enum(['bill', 'credit_note']),
  prefix: z.string().max(10),
  padding: z.number().int().min(1).max(8),
  includeFy: z.boolean(),
  nextNumber: z.number().int().min(1).max(99_999_999).optional(),
});
// table: series
export const seriesPatchInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(40).optional(),
  prefix: z.string().max(10).optional(),
  padding: z.number().int().min(1).max(8).optional(),
  includeFy: z.boolean().optional(),
  nextNumber: z.number().int().min(1).max(99_999_999).optional(),
  active: z.boolean().optional(),
});
// table: businesses
export const defaultSeriesInput = z.object({
  defaultSeriesId: z.string().uuid(),
});
// table: customers
export const customerInput = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(200),
  contactPerson: z.string().trim().max(100).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().max(120).nullable().optional(),
  gstin: z.string().trim().max(15).nullable().optional(),
  pan: z.string().trim().max(10).nullable().optional(),
  address: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  pincode: z.string().trim().max(10).nullable().optional(),
  stateCode: z.string().trim().max(2).nullable().optional(),
  language: z.string().max(10).nullable().optional(),
  languageSource: z.enum(['owner', 'guess']).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
// table: customers
export const archiveCustomerInput = z.object({ id: z.string().uuid(), archived: z.boolean() });
// table: items
export const itemInput = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(300).nullable().optional(),
  hsnSac: z.string().trim().max(8).nullable().optional(),
  unit: z.string().trim().max(12).nullable().optional(),
  defaultRatePaise: z.number().int().min(0).nullable().optional(),
  defaultTaxBp: z.number().int().min(0).max(10000).nullable().optional(),
  priceIncludesTax: z.boolean().nullable().optional(),
});
// table: items
export const archiveItemInput = z.object({ id: z.string().uuid(), archived: z.boolean() });
// table: import_rows
export const commitImportInput = z.object({
  /** The import the rows belong to (imports.id). */
  importId: z.string().uuid(),
  /** The rows the owner ticked (import_rows.id). */
  rowIds: z.array(z.string().uuid()).max(500),
});
