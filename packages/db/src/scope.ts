import 'server-only';

import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type pg from 'pg';

import { getPool } from './pool';
import * as schema from './schema';

/**
 * TenantScope (I1, I8): who is acting, for which business, as what, under
 * which request. Every repository function takes it first. withTenant()
 * runs one transaction as the application role with the scope in the
 * session settings the policies and triggers read.
 */
export type Role = 'owner' | 'staff' | 'accountant';
export type ActorKind = 'user' | 'model' | 'system';

export interface TenantScope {
  businessId: string;
  userId: string;
  role: Role;
  requestId: string;
  actorKind?: ActorKind;
}

export type Db = NodePgDatabase<typeof schema>;

export interface Tx {
  db: Db;
  client: pg.PoolClient;
  scope: TenantScope;
}

/** One transaction, SET LOCAL ROLE ekbill_app, the scope in app.* settings; commits on return, rolls back on throw. */
export async function withTenant<T>(scope: TenantScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query('set local role ekbill_app');
    await client.query(
      "select set_config('app.business_id', $1, true), set_config('app.user_id', $2, true), set_config('app.actor_kind', $3, true), set_config('app.request_id', $4, true)",
      [scope.businessId, scope.userId, scope.actorKind ?? 'user', scope.requestId],
    );
    const result = await fn({ db: drizzle(client, { schema }), client, scope });
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * A transaction with no business (a sign-in, a brand-new owner creating their
 * business): the application role, the user and the request in the settings,
 * no app.business_id, so every tenancy policy sees nothing.
 */
export async function withUser<T>(
  who: { userId: string | null; requestId: string; actorKind?: ActorKind },
  fn: (tx: { db: Db; client: pg.PoolClient }) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query('set local role ekbill_app');
    await client.query(
      "select set_config('app.user_id', $1, true), set_config('app.actor_kind', $2, true), set_config('app.request_id', $3, true)",
      [who.userId ?? '', who.actorKind ?? 'user', who.requestId],
    );
    const result = await fn({ db: drizzle(client, { schema }), client });
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
