import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (t) => [
    check('businesses_status', sql`${t.status} in ('active', 'archived')`),
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
    customerId: uuid('customer_id'),
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
  },
  (t) => [
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
