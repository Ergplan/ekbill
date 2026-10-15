import pg from 'pg';

// A SQL date is a civil date (YYYY-MM-DD), never an instant: keep it as the string the engine takes.
pg.types.setTypeParser(1082, (value) => value);

/** One pool per process (the login role; withTenant drops to ekbill_app per transaction). */
let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    pool = new pg.Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000 });
  }
  return pool;
}

/** Tests: drop the pool so the next call reads DATABASE_URL again. */
export async function closePool(): Promise<void> {
  const p = pool;
  pool = null;
  await p?.end();
}
