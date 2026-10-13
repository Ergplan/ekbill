/**
 * The database, as Drizzle sees it. Empty in Stage 0; Stage 2 adds people,
 * businesses, memberships, sessions, audit_events and ai_calls; Stage 3 adds
 * series and documents. Every business table goes through applyTenancy()
 * in a migration (tenancy.sql) so RLS and the audit trigger cannot be missed.
 */
export {};
