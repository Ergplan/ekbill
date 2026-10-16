import 'server-only';

import { getPool } from './pool';

/**
 * @ekbill/db: the one place that writes the database. Stage 2: identity,
 * tenancy (withTenant), sessions (resolveScope), the repositories (TenantScope
 * first, allowedRoles on every write) and the build seed. Stage 3: series and
 * documents, with issueDocument() the one writer of issued documents (I2).
 */
export { closePool, getPool } from './pool';
export { withTenant, withUser, type ActorKind, type Db, type Role, type TenantScope, type Tx } from './scope';
export {
  SESSION_DAYS,
  createSession,
  adoptBusiness,
  deleteSession,
  membershipsOf,
  resolveScope,
  type Resolved,
  type SessionUser,
} from './auth';
export { ForbiddenError, NotFoundError, allow } from './repos/allow';
export type { Business, BusinessProfile } from './repos/businesses';
export type { Series } from './repos/series';
export type { BusinessFile } from './repos/files';
export type { BillRow, Document } from './repos/documents';
export type { DocumentFile } from './repos/document-files';
export type { Customer } from './repos/customers';
export type { Item } from './repos/items';
export type { Payment } from './repos/payments';
export type { ReminderSent } from './repos/reminders';
export type { Import, ImportRow, FileReading, FileSummary } from './repos/imports';
export { REPOSITORIES, type RepositoryName } from './repos/index';
export * as businesses from './repos/businesses';
export * as customers from './repos/customers';
export * as documentFiles from './repos/document-files';
export * as documents from './repos/documents';
export * as files from './repos/files';
export * as imports from './repos/imports';
export * as items from './repos/items';
export * as memberships from './repos/memberships';
export * as payments from './repos/payments';
export * as reminders from './repos/reminders';
export * as series from './repos/series';
export * as users from './repos/users';
export {
  SEED,
  seedAllowed,
  seedBuild,
  seedBusinessById,
  seedCustomerId,
  seedCustomerKey,
  seedItemId,
  seedUser,
  seedUserById,
} from './seed';
export * as schema from './schema';
export { businessesWithBills } from './system';

export interface SchemaStatus {
  ok: boolean;
  version: string | null;
  error?: string;
}

/** The newest applied migration, or why the database could not say. */
export async function schemaStatus(): Promise<SchemaStatus> {
  try {
    const { rows } = await getPool().query<{ tag: string }>(
      'select tag from schema_migrations order by applied_at desc limit 1',
    );
    return { ok: true, version: rows[0]?.tag ?? null };
  } catch (error) {
    const e = error as { code?: string; message?: string };
    return { ok: false, version: null, error: `${e.code ?? 'ERR'} ${(e.message ?? '').slice(0, 200)}` };
  }
}
