import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

/**
 * The database, as Drizzle sees it (Stage 2: identity, tenancy, roles, audit,
 * the model-call log). Migrations are the SQL in ../migrations (generated
 * from this file with `npm run db:generate`, then RLS, triggers and roles
 * appended by hand in the same file). Every business table goes through
 * apply_tenancy() (packages/db/tenancy.sql) so RLS and the audit trigger
 * cannot be missed. Stage 3 adds series and documents, and the seller
 * columns on businesses that issuing a document needs; Stage 4 adds the rest
 * of the profile.
 */

/** A person who signs in (phone), with their own theme and language. No business data here (I1). */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phoneE164: text('phone_e164').notNull().unique(),
    name: text('name').notNull(),
    /** narangi | harmony | system */
    theme: text('theme').notNull().default('narangi'),
    /** hi-Latn | en */
    language: text('language').notNull().default('hi-Latn'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  },
  (t) => [
    check('users_theme', sql`${t.theme} in ('narangi', 'harmony', 'system')`),
    check('users_language', sql`${t.language} in ('hi-Latn', 'en')`),
    check('users_phone_e164', sql`${t.phoneE164} ~ '^\\+[1-9][0-9]{7,14}$'`),
  ],
);

/**
 * A tenant. Stage 3 holds what issuing a document reads of the seller
 * (registration, GSTIN, state, turnover, the e-invoicing answer, the lines
 * printed on the bill); Stage 4 adds the rest of the profile (PAN, bank,
 * look, logo, signature, default series).
 */
export const businesses = pgTable(
  'businesses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    legalName: text('legal_name').notNull(),
    tradeName: text('trade_name').notNull(),
    /** active | archived (nothing is deleted, 8.3) */
    status: text('status').notNull().default('active'),
    /** regular | composition | not-registered | not-sure: the setup answer (8.0), as given. */
    registrationType: text('registration_type').notNull().default('not-sure'),
    gstin: text('gstin'),
    /** The seller's state code ("27"), from the GSTIN when there is one. */
    stateCode: text('state_code'),
    /** The highest aggregate turnover of any year since 2017-18, in paise; null until the owner says. */
    turnoverPaise: bigint('turnover_paise', { mode: 'number' }),
    /** Whether e-invoicing applies: null until the owner answers (asked once when the turnover band needs it). */
    eInvoicingApplies: boolean('e_invoicing_applies'),
    address: text('address'),
    city: text('city'),
    phone: text('phone'),
    upi: text('upi'),
    // --- Stage 4: the rest of the profile ---
    pincode: text('pincode'),
    email: text('email'),
    pan: text('pan'),
    /** The setup chip: 40l | 40l-1.5cr | 1.5-5cr | 5cr+ (turnover_paise is its upper bound, for the engine). */
    turnoverBand: text('turnover_band'),
    /** A composition business prints this on every bill of supply (from the pack, kept with the profile). */
    compositionLegend: text('composition_legend'),
    bankName: text('bank_name'),
    bankAccount: text('bank_account'),
    bankIfsc: text('bank_ifsc'),
    bankHolder: text('bank_holder'),
    defaultPaymentTermsDays: integer('default_payment_terms_days').notNull().default(0),
    /** classic | modern | simple */
    billDesign: text('bill_design').notNull().default('classic'),
    /** a4 | a5 | 80mm | 58mm */
    billPaper: text('bill_paper').notNull().default('a4'),
    /** pdf | jpg */
    billShareAs: text('bill_share_as').notNull().default('pdf'),
    billAccent: text('bill_accent').notNull().default('#2f4a9e'),
    logoFileId: uuid('logo_file_id').references((): AnyPgColumn => businessFiles.id),
    signatureFileId: uuid('signature_file_id').references((): AnyPgColumn => businessFiles.id),
    defaultSeriesId: uuid('default_series_id').references((): AnyPgColumn => series.id),
    voiceOnArrival: boolean('voice_on_arrival').notNull().default(true),
    setupDoneAt: timestamp('setup_done_at', { withTimezone: true }),
    /** Stage 10: a business the load seed made; only these are ever removed (the load seed's own clean-up). */
    loadTest: boolean('load_test').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (t) => [
    index('businesses_load_test')
      .on(t.loadTest)
      .where(sql`${t.loadTest}`),
    check('businesses_status', sql`${t.status} in ('active', 'archived')`),
    check(
      'businesses_turnover_band',
      sql`${t.turnoverBand} is null or ${t.turnoverBand} in ('40l', '40l-1.5cr', '1.5-5cr', '5cr+')`,
    ),
    check('businesses_pan', sql`${t.pan} is null or ${t.pan} ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'`),
    check('businesses_pincode', sql`${t.pincode} is null or ${t.pincode} ~ '^[1-9][0-9]{5}$'`),
    check('businesses_payment_terms', sql`${t.defaultPaymentTermsDays} between 0 and 365`),
    check('businesses_bill_design', sql`${t.billDesign} in ('classic', 'modern', 'simple')`),
    check('businesses_bill_paper', sql`${t.billPaper} in ('a4', 'a5', '80mm', '58mm')`),
    check('businesses_bill_share_as', sql`${t.billShareAs} in ('pdf', 'jpg')`),
    check('businesses_bill_accent', sql`${t.billAccent} ~ '^#[0-9a-fA-F]{6}$'`),
    check(
      'businesses_registration_type',
      sql`${t.registrationType} in ('regular', 'composition', 'not-registered', 'not-sure')`,
    ),
    check('businesses_gstin', sql`${t.gstin} is null or ${t.gstin} ~ '^[0-9]{2}[A-Z0-9]{13}$'`),
    check('businesses_state_code', sql`${t.stateCode} is null or ${t.stateCode} ~ '^[0-9]{2}$'`),
    check('businesses_turnover', sql`${t.turnoverPaise} is null or ${t.turnoverPaise} >= 0`),
  ],
);

/** Who may act for a business, and as what (8.3). Read before a scope exists (resolveScope), so no RLS (I1). */
export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** owner | staff | accountant */
    role: text('role').notNull(),
    /** invited | active | removed */
    status: text('status').notNull().default('invited'),
    invitedBy: uuid('invited_by').references(() => users.id),
    invitedAt: timestamp('invited_at', { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('memberships_business_user').on(t.businessId, t.userId),
    // One active owner per business.
    uniqueIndex('memberships_one_active_owner')
      .on(t.businessId)
      .where(sql`${t.role} = 'owner' and ${t.status} = 'active'`),
    index('memberships_user').on(t.userId),
    check('memberships_role', sql`${t.role} in ('owner', 'staff', 'accountant')`),
    check('memberships_status', sql`${t.status} in ('invited', 'active', 'removed')`),
  ],
);

/** A signed-in device, for one business and role at a time. Build: created by /dev/switch; Stage 10: by OTP. */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** Null for an owner who has no business yet (the welcome flow). */
    businessId: uuid('business_id').references(() => businesses.id),
    role: text('role'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    userAgent: text('user_agent'),
  },
  (t) => [
    index('sessions_user').on(t.userId),
    check('sessions_role', sql`${t.role} is null or ${t.role} in ('owner', 'staff', 'accountant')`),
  ],
);

/** Append-only (I7): one row per authoritative write, written by the audit trigger alone. */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    businessId: uuid('business_id').notNull(),
    actorUserId: uuid('actor_user_id'),
    /** user | model | system */
    actorKind: text('actor_kind').notNull(),
    tableName: text('table_name').notNull(),
    rowId: text('row_id').notNull(),
    /** INSERT | UPDATE | DELETE */
    action: text('action').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    requestId: text('request_id'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_events_business_at').on(t.businessId, t.at),
    check('audit_events_actor_kind', sql`${t.actorKind} in ('user', 'model', 'system')`),
    check('audit_events_action', sql`${t.action} in ('INSERT', 'UPDATE', 'DELETE')`),
  ],
);

/** Every model call (rule 9, I6): provenance and cost. business_id null for a system call. */
export const aiCalls = pgTable(
  'ai_calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id').references(() => businesses.id),
    userId: uuid('user_id').references(() => users.id),
    purpose: text('purpose').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    inputHash: text('input_hash').notNull(),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    costMicros: bigint('cost_micros', { mode: 'number' }),
    latencyMs: integer('latency_ms'),
    /** ok | error | timeout | refused */
    outcome: text('outcome').notNull(),
    error: text('error'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ai_calls_business_at').on(t.businessId, t.at),
    check('ai_calls_outcome', sql`${t.outcome} in ('ok', 'error', 'timeout', 'refused')`),
  ],
);

/**
 * A numbering series (I3): per business, per kind, gapless within a
 * financial year. The arithmetic is packages/engine/src/numbering.ts; the
 * allocation locks this row (repos/documents.ts#issueDocument).
 */
export const series = pgTable(
  'series',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    name: text('name').notNull(),
    /** bill | credit_note: a credit note never takes a bill's number. */
    kind: text('kind').notNull().default('bill'),
    prefix: text('prefix').notNull().default(''),
    padding: integer('padding').notNull().default(3),
    includeFy: boolean('include_fy').notNull().default(false),
    nextNumber: integer('next_number').notNull().default(1),
    /** The financial year next_number belongs to ("2026-27"); null until the first document. */
    fy: text('fy'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('series_business_name').on(t.businessId, t.name),
    check('series_kind', sql`${t.kind} in ('bill', 'credit_note')`),
    check('series_prefix', sql`${t.prefix} ~ '^[A-Za-z0-9/-]{0,10}$'`),
    check('series_padding', sql`${t.padding} between 1 and 8`),
    check('series_next_number', sql`${t.nextNumber} between 1 and 99999999`),
    check('series_fy', sql`${t.fy} is null or ${t.fy} ~ '^[0-9]{4}-[0-9]{2}$'`),
  ],
);

/**
 * A document (I2): a draft until issueDocument() gives it a number and its
 * snapshot in one transaction; from then on number, issued_at,
 * issued_snapshot, totals and lines never change (the trigger in
 * migrations/0002_documents.sql refuses). Corrections are new documents
 * that link back. customer_id has no foreign key until Stage 5 creates
 * customers; the customer's details at issue time live in the snapshot.
 */
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    seriesId: uuid('series_id')
      .notNull()
      .references(() => series.id),
    /** tax_invoice | bill_of_supply | credit_note: provisional on a draft, decided by the engine at issue. */
    kind: text('kind').notNull(),
    /** draft | issued | cancelled */
    status: text('status').notNull().default('draft'),
    number: text('number'),
    financialYear: text('financial_year'),
    issueDate: date('issue_date', { mode: 'string' }).notNull(),
    dueDate: date('due_date', { mode: 'string' }),
    customerId: uuid('customer_id').references((): AnyPgColumn => customers.id),
    customerName: text('customer_name').notNull(),
    customerGstin: text('customer_gstin'),
    customerState: text('customer_state'),
    /** Until Stage 5 (customers table), the draft carries what the thresholds and the paper need. */
    customerAddress: text('customer_address'),
    customerPhone: text('customer_phone'),
    placeOfSupplyState: text('place_of_supply_state'),
    /** SupplyFlag[] from the engine, plus without_gst for a registered seller's bill without tax. */
    flags: jsonb('flags')
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** The lines as drafted (IssueLine[]); replaced by the engine's priced lines at issue. */
    lines: jsonb('lines')
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** The running figures on a draft (never authoritative); the engine's totals once issued. */
    totals: jsonb('totals'),
    /** IssuedSnapshot: everything a customer sees is rendered from this (I2). */
    issuedSnapshot: jsonb('issued_snapshot'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    /** The invoice a credit note corrects, or the bill a redo replaces. */
    linkedDocumentId: uuid('linked_document_id').references((): AnyPgColumn => documents.id),
    /** The e-invoice portal's reference, once reported (Stage 8). */
    irn: text('irn'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledReason: text('cancelled_reason'),
    notes: text('notes'),
    roundToRupee: boolean('round_to_rupee').notNull().default(false),
    gstOn: boolean('gst_on').notNull().default(true),
    revision: integer('revision').notNull().default(1),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** Search over the number and the customer's name (Stage 6): kept by Postgres itself, never by a job. */
    search: tsvector('search').generatedAlwaysAs(
      sql`to_tsvector('simple', coalesce(number, '') || ' ' || coalesce(customer_name, ''))`,
    ),
  },
  (t) => [
    index('documents_search').using('gin', t.search),
    index('documents_customer').on(t.businessId, t.customerId),
    // I3: a number is unique per series per financial year, and backs the gapless allocation.
    uniqueIndex('documents_number')
      .on(t.businessId, t.seriesId, t.financialYear, t.number)
      .where(sql`${t.number} is not null`),
    index('documents_business_status_date').on(t.businessId, t.status, t.issueDate),
    index('documents_linked').on(t.linkedDocumentId),
    check('documents_kind', sql`${t.kind} in ('tax_invoice', 'bill_of_supply', 'credit_note')`),
    check('documents_status', sql`${t.status} in ('draft', 'issued', 'cancelled')`),
    // A draft has no number; an issued or cancelled document has its number, its year, its time and its snapshot.
    check(
      'documents_issued_complete',
      sql`(${t.status} = 'draft' and ${t.number} is null and ${t.issuedSnapshot} is null and ${t.issuedAt} is null)
        or (${t.status} in ('issued', 'cancelled') and ${t.number} is not null and ${t.financialYear} is not null and ${t.issuedSnapshot} is not null and ${t.issuedAt} is not null)`,
    ),
    check('documents_cancelled_complete', sql`(${t.status} = 'cancelled') = (${t.cancelledAt} is not null)`),
    check('documents_credit_note_linked', sql`${t.kind} <> 'credit_note' or ${t.linkedDocumentId} is not null`),
  ],
);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

/** The 300 KB cap on a logo or a signature file (Stage 4); the engine's files.ts says the same number to the browser. */
export const BUSINESS_FILE_MAX_BYTES = 300 * 1024;

/**
 * A business's logo and signature, as bytes in Postgres (Stage 4: files stay
 * in Postgres). Written only by repos/files.ts; the business row points at
 * the current one of each kind, older ones stay (nothing is deleted).
 */
export const businessFiles = pgTable(
  'business_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    /** logo | signature */
    kind: text('kind').notNull(),
    mime: text('mime').notNull(),
    bytes: bytea('bytes').notNull(),
    size: integer('size').notNull(),
    sha256: text('sha256').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('business_files_business_kind').on(t.businessId, t.kind),
    check('business_files_kind', sql`${t.kind} in ('logo', 'signature')`),
    check('business_files_mime', sql`${t.mime} in ('image/png', 'image/jpeg', 'image/webp')`),
    check('business_files_size', sql`${t.size} between 1 and ${sql.raw(String(BUSINESS_FILE_MAX_BYTES))}`),
    check('business_files_sha256', sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
  ],
);

/**
 * Who the bills go to (Stage 5). One row per customer per business; a phone,
 * when given, is unique within the business. Nothing is deleted: archived
 * customers leave the lists and keep their bills.
 */
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    name: text('name').notNull(),
    contactPerson: text('contact_person'),
    phone: text('phone'),
    email: text('email'),
    address: text('address'),
    city: text('city'),
    pincode: text('pincode'),
    stateCode: text('state_code'),
    gstin: text('gstin'),
    pan: text('pan'),
    /** hi-Latn | en | hi | mr | gu | ta | te | kn | bn: the language reminders go out in. */
    language: text('language').notNull().default('hi-Latn'),
    /** owner (chosen) | guess (offered and accepted); null when never set. */
    languageSource: text('language_source'),
    notes: text('notes'),
    archived: boolean('archived').notNull().default(false),
    lastBilledAt: date('last_billed_at', { mode: 'string' }),
    /** The import row this customer came from, when it came from one (I6: the owner ticked it). */
    importRowId: uuid('import_row_id'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('customers_business_phone')
      .on(t.businessId, t.phone)
      .where(sql`${t.phone} is not null`),
    index('customers_business_name').on(t.businessId, t.name),
    check('customers_phone', sql`${t.phone} is null or ${t.phone} ~ '^\\+[1-9][0-9]{7,14}$'`),
    check('customers_gstin', sql`${t.gstin} is null or ${t.gstin} ~ '^[0-9]{2}[A-Z0-9]{13}$'`),
    check('customers_pan', sql`${t.pan} is null or ${t.pan} ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'`),
    check('customers_state_code', sql`${t.stateCode} is null or ${t.stateCode} ~ '^[0-9]{2}$'`),
    check('customers_pincode', sql`${t.pincode} is null or ${t.pincode} ~ '^[1-9][0-9]{5}$'`),
    check('customers_language', sql`${t.language} in ('hi-Latn', 'en', 'hi', 'mr', 'gu', 'ta', 'te', 'kn', 'bn')`),
    check('customers_language_source', sql`${t.languageSource} is null or ${t.languageSource} in ('owner', 'guess')`),
  ],
);

/** What is usually on the bills (Stage 5): the name is unique per business, case aside. */
export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    name: text('name').notNull(),
    description: text('description'),
    hsnSac: text('hsn_sac'),
    unit: text('unit'),
    defaultRatePaise: bigint('default_rate_paise', { mode: 'number' }),
    /** Basis points (1800 = 18 %); null: the bill's rate applies. */
    defaultTaxBp: integer('default_tax_bp'),
    priceIncludesTax: boolean('price_includes_tax').notNull().default(false),
    archived: boolean('archived').notNull().default(false),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('items_business_name').on(t.businessId, sql`lower(${t.name})`),
    check('items_hsn_sac', sql`${t.hsnSac} is null or ${t.hsnSac} ~ '^[0-9]{2,8}$'`),
    check('items_rate', sql`${t.defaultRatePaise} is null or ${t.defaultRatePaise} >= 0`),
    check('items_tax', sql`${t.defaultTaxBp} is null or ${t.defaultTaxBp} between 0 and 10000`),
  ],
);

/**
 * "Purane bills upload karo" (Stage 5; I6): one import is the files the
 * owner picked; the worker reads them into import_rows; nothing becomes a
 * customer until the owner ticks it and taps "add karo".
 */
export const imports = pgTable(
  'imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    /** reading | ready | failed | committed */
    status: text('status').notNull().default('reading'),
    /** What each file gave: [{ name, kind, reader, pages, found, problem }] (written by the worker). */
    summary: jsonb('summary')
      .notNull()
      .default(sql`'[]'::jsonb`),
    error: text('error'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
    committedAt: timestamp('committed_at', { withTimezone: true }),
    addedCount: integer('added_count'),
  },
  (t) => [
    index('imports_business_created').on(t.businessId, t.createdAt),
    check('imports_status', sql`${t.status} in ('reading', 'ready', 'failed', 'committed')`),
  ],
);

/** The files of an import, as bytes in Postgres for the worker to read (8 MB each at most). */
export const importFiles = pgTable(
  'import_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    importId: uuid('import_id')
      .notNull()
      .references(() => imports.id),
    name: text('name').notNull(),
    mime: text('mime').notNull(),
    bytes: bytea('bytes').notNull(),
    size: integer('size').notNull(),
    sha256: text('sha256').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('import_files_import').on(t.importId),
    check('import_files_size', sql`${t.size} between 1 and ${sql.raw(String(8 * 1024 * 1024))}`),
  ],
);

/** One customer read from an import, before the owner says yes (I6: staging only). */
export const importRows = pgTable(
  'import_rows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    importId: uuid('import_id')
      .notNull()
      .references(() => imports.id),
    position: integer('position').notNull(),
    fileName: text('file_name').notNull(),
    /** The ImportedCustomer the reader produced. */
    candidate: jsonb('candidate').notNull(),
    /** The customer it already is ("Pehle se hai"), when the matcher found one. */
    existingCustomerId: uuid('existing_customer_id').references(() => customers.id),
    /** The customer the owner's tick created. */
    customerId: uuid('customer_id').references(() => customers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('import_rows_import_position').on(t.importId, t.position)],
);

/**
 * Money against a bill (Stage 6): a payment ("Paise aa gaye", full or part)
 * or an adjustment ("Kam karo": written off, not received). What is due is
 * one function (packages/engine/src/ledger.ts#balanceOf). An entry is never
 * changed or removed: a mistake is reversed, once, with a reason.
 */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id),
    /** payment | adjustment */
    kind: text('kind').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    /** upi | cash | bank | cheque | other; null for an adjustment. */
    method: text('method'),
    note: text('note'),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    reversedBy: uuid('reversed_by').references(() => users.id),
    reversalReason: text('reversal_reason'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payments_document').on(t.documentId),
    index('payments_business_date').on(t.businessId, t.date),
    check('payments_kind', sql`${t.kind} in ('payment', 'adjustment')`),
    check('payments_amount', sql`${t.amountPaise} > 0`),
    check(
      'payments_method',
      sql`(${t.kind} = 'payment' and ${t.method} in ('upi', 'cash', 'bank', 'cheque', 'other')) or (${t.kind} = 'adjustment' and ${t.method} is null)`,
    ),
    check('payments_reversal', sql`(${t.reversedAt} is null) = (${t.reversedBy} is null)`),
  ],
);

/**
 * A bill as a file (Stage 6): rendered from its issued snapshot, once per
 * format, paper and design, and kept; a re-render of an issued bill gives
 * the same bill (I2).
 */
export const documentFiles = pgTable(
  'document_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id),
    /** pdf | jpg */
    kind: text('kind').notNull(),
    /** a4 | a5 | 80mm | 58mm */
    paper: text('paper').notNull(),
    /** classic | modern | simple */
    design: text('design').notNull(),
    bytes: bytea('bytes').notNull(),
    size: integer('size').notNull(),
    sha256: text('sha256').notNull(),
    renderMs: integer('render_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('document_files_one').on(t.documentId, t.kind, t.paper, t.design),
    check('document_files_kind', sql`${t.kind} in ('pdf', 'jpg')`),
    check('document_files_paper', sql`${t.paper} in ('a4', 'a5', '80mm', '58mm')`),
    check('document_files_design', sql`${t.design} in ('classic', 'modern', 'simple')`),
  ],
);

/** A reminder the owner opened in WhatsApp (Stage 6): the tone, the language, the words. Nothing is sent by the app. */
export const remindersSent = pgTable(
  'reminders_sent',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id),
    customerId: uuid('customer_id').references(() => customers.id),
    /** gentle | direct | second */
    tone: text('tone').notNull(),
    language: text('language').notNull(),
    text: text('text').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reminders_sent_document').on(t.documentId),
    check('reminders_sent_tone', sql`${t.tone} in ('gentle', 'direct', 'second')`),
  ],
);

/**
 * A photographed bill (Stage 7), as the owner picked it: kept as it came,
 * never changed (8 MB at most). The worker reads it into an extraction.
 */
export const uploads = pgTable(
  'uploads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    /** bill-photo: a kaccha bill or an old printed one, to read into a draft. */
    kind: text('kind').notNull().default('bill-photo'),
    name: text('name').notNull(),
    mime: text('mime').notNull(),
    bytes: bytea('bytes').notNull(),
    size: integer('size').notNull(),
    sha256: text('sha256').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('uploads_business_created').on(t.businessId, t.createdAt),
    check('uploads_kind', sql`${t.kind} in ('bill-photo')`),
    check('uploads_size', sql`${t.size} between 1 and ${sql.raw(String(8 * 1024 * 1024))}`),
  ],
);

/**
 * What the model read from an upload (I6: staging only, never a document).
 * The worker writes the reading once (actor 'model'); the owner reviews it,
 * and "Bill banao" makes a bill through Stage 6's path and points here.
 */
export const extractions = pgTable(
  'extractions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    uploadId: uuid('upload_id')
      .notNull()
      .references(() => uploads.id),
    /** pending → ready | failed (the worker); ready → reviewed → committed | discarded (a person). */
    status: text('status').notNull().default('pending'),
    /** Why a reading failed: unreadable | no-bill | ai-unavailable | invalid | error. */
    error: text('error'),
    model: text('model'),
    promptVersion: text('prompt_version'),
    doclingUsed: boolean('docling_used').notNull().default(false),
    /** The photo the model saw: rotated upright, at most 2000 px, JPEG q85. */
    image: bytea('image'),
    /** The reading after the engine's checks: {customer, date, lines[], totals, notes}, each field with its confidence. */
    result: jsonb('result'),
    warnings: jsonb('warnings')
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** The customer it matched, with the score (0–1). */
    matchedCustomerId: uuid('matched_customer_id').references(() => customers.id),
    matchScorePct: integer('match_score_pct'),
    aiCallId: uuid('ai_call_id').references(() => aiCalls.id),
    costMicros: bigint('cost_micros', { mode: 'number' }),
    latencyMs: integer('latency_ms'),
    committedDocumentId: uuid('committed_document_id').references(() => documents.id),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('extractions_business_created').on(t.businessId, t.createdAt),
    index('extractions_upload').on(t.uploadId),
    check(
      'extractions_status',
      sql`${t.status} in ('pending', 'ready', 'failed', 'reviewed', 'committing', 'committed', 'discarded')`,
    ),
    check(
      'extractions_error',
      sql`${t.error} is null or ${t.error} in ('unreadable', 'no-bill', 'ai-unavailable', 'invalid', 'error')`,
    ),
  ],
);

/** A field the owner changed on the review screen: what the model said, what the person wrote (the eval's raw material). */
export const extractionCorrections = pgTable(
  'extraction_corrections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    extractionId: uuid('extraction_id')
      .notNull()
      .references(() => extractions.id),
    /** customer | date | lines.0.what | lines.0.qty | lines.0.rate | total … */
    field: text('field').notNull(),
    modelValue: text('model_value'),
    humanValue: text('human_value'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('extraction_corrections_extraction').on(t.extractionId)],
);

/**
 * Poocho's index (Stage 9): one row per issued bill or credit note, customer
 * and item, as the plain sentences the engine writes (packages/engine
 * poocho.ts), searched by words (the generated tsvector) and by meaning (the
 * embedding, filled by the worker when an embedding model is set up). Derived
 * and rebuilt from the records: a changed record rewrites its row in place
 * (version is the fingerprint of what the text was written from); nothing is
 * deleted (an archived customer's row says so and is skipped).
 */
export const searchRecords = pgTable(
  'search_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    /** bill | customer | item */
    kind: text('kind').notNull(),
    sourceId: uuid('source_id').notNull(),
    title: text('title').notNull(),
    text: text('text').notNull(),
    href: text('href').notNull(),
    version: text('version').notNull(),
    hidden: boolean('hidden').notNull().default(false),
    tsv: tsvector('tsv').generatedAlwaysAs(sql`to_tsvector('simple', title || ' ' || text)`),
    embedding: vector('embedding', { dimensions: 256 }),
    /** The version the embedding was made from; behind `version` means it is due again. */
    embeddedVersion: text('embedded_version'),
    embedModel: text('embed_model'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('search_records_source').on(t.businessId, t.kind, t.sourceId),
    index('search_records_tsv').using('gin', t.tsv),
    index('search_records_embedding').using('hnsw', t.embedding.op('vector_cosine_ops')),
    check('search_records_kind', sql`${t.kind} in ('bill', 'customer', 'item')`),
  ],
);
