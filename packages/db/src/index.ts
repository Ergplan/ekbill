import 'server-only';

import pg from 'pg';

/**
 * One pool per process. Scoped access (withTenant) arrives in Stage 2; in
 * Stage 0 the only consumer is /api/health, which asks the schema version.
 */
let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    pool = new pg.Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000 });
  }
  return pool;
}

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
