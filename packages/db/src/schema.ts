import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * The database, as Drizzle sees it (Stage 2: identity, tenancy, roles, audit,
 * the model-call log). Migrations are the SQL in ../migrations (generated
 * from this file with `npm run db:generate`, then RLS, triggers and roles
 * appended by hand in the same file). Every business table goes through
 * apply_tenancy() (packages/db/tenancy.sql) so RLS and the audit trigger
 * cannot be missed. Stage 3 adds series and documents.
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

/** A tenant. The profile fields (GSTIN, address, UPI, look) arrive in Stage 4. */
export const businesses = pgTable(
  'businesses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    legalName: text('legal_name').notNull(),
    tradeName: text('trade_name').notNull(),
    /** active | archived (nothing is deleted, 8.3) */
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (t) => [check('businesses_status', sql`${t.status} in ('active', 'archived')`)],
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
