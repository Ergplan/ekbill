import { migrate } from '@ekbill/db/migrate';
import pg from 'pg';

/**
 * Integration tests run against one real Postgres, emptied and migrated once
 * per run. The URL must say "test" somewhere in the database name: a dev or
 * production database is never wiped by a test run.
 */
export default async function setup() {
  const url = process.env.DATABASE_URL_TEST ?? 'postgres://postgres@127.0.0.1:5440/ekbill2_test';
  const name = url.split('/').pop()?.split('?')[0] ?? '';
  if (!/test/.test(name)) throw new Error(`DATABASE_URL_TEST must name a test database, got "${name}"`);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('drop schema if exists pgboss cascade');
    await client.query('drop schema public cascade');
    await client.query('create schema public');
  } finally {
    await client.end();
  }
  await migrate(url, { log: () => undefined });
  process.env.DATABASE_URL = url;
}
