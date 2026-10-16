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

/** One line of the bill form as typed: the engine parses the strings (parseQuantity, parseMoney). */
const billLine = z.object({
  what: z.string().trim().max(200),
  qty: z.string().trim().max(20),
  rate: z.string().trim().max(20),
  gstRate: z.number().min(0).max(100).nullable(),
});
// table: documents
/** "Bill banao": the form as typed; the server drafts and issues it (issueDocument, I2). */
export const issueBillInput = z.object({
  /** The draft an earlier refused attempt left (the same bill tried again), else absent. */
  id: z.string().uuid().nullable().optional(),
  seriesId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  customerName: z.string().trim().min(1).max(200),
  customerGstin: z.string().trim().max(15).nullable().optional(),
  customerPhone: z.string().trim().max(30).nullable().optional(),
  customerState: z.string().trim().max(2).nullable().optional(),
  /** The new customer's language, when the form adds one. */
  customerLanguage: z.enum(['hi-Latn', 'en']).nullable().optional(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gstOn: z.boolean(),
  lines: z.array(billLine).min(1).max(100),
});
// table: documents
/** Cancel (owner): the reason stays on the bill; the number is never reused. */
export const cancelBillInput = z.object({
  id: z.string().uuid(),
  cancelledReason: z.string().trim().min(1).max(200),
});
// table: documents
/** A credit note against an issued bill (owner): an amount and a reason. */
export const creditNoteBillInput = z.object({
  linkedDocumentId: z.string().uuid(),
  amount: z.string().trim().min(1).max(20),
  notes: z.string().trim().min(1).max(200),
});
// table: payments
/** "Paise aa gaye" (payment) or "Kam karo" (adjustment, owner). */
export const paymentInput = z.object({
  documentId: z.string().uuid(),
  kind: z.enum(['payment', 'adjustment']),
  amount: z.string().trim().min(1).max(20),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.enum(['upi', 'cash', 'bank', 'cheque', 'other']).nullable().optional(),
  note: z.string().trim().max(200).nullable().optional(),
});
// table: payments
/** A mistaken entry undone (owner), with a reason. */
export const reversalInput = z.object({
  id: z.string().uuid(),
  reversalReason: z.string().trim().min(1).max(200),
});
// table: reminders_sent
/** A reminder handed to WhatsApp: what was opened, in which tone and language (never sent by the app). */
export const reminderInput = z.object({
  documentId: z.string().uuid(),
  tone: z.enum(['gentle', 'direct', 'second']),
  language: z.enum(['hi-Latn', 'en']),
  text: z.string().max(2000),
});
// table: extraction_corrections
/** "Bill banao" on the photo review: the bill as reviewed, and what the owner changed from the reading. */
export const photoBillInput = issueBillInput.extend({
  extractionId: z.string().uuid(),
  corrections: z
    .array(
      z.object({
        field: z.string().max(60),
        modelValue: z.string().max(500).nullable(),
        humanValue: z.string().max(500).nullable(),
      }),
    )
    .max(200),
});
