#!/usr/bin/env node
// Apply pending SQL migrations in order, once, under an advisory lock.
//
// Plain ESM with no build step, so the container can run it before the server
// starts (deploy/Dockerfile) and the tests can import it. Each file in
// migrations/ is applied in one transaction and recorded in schema_migrations
// by its file name; a file that is already recorded is skipped. Migrations
// are never edited after they are applied: add a new one.
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
const LOCK_KEY = 7_201_019; // arbitrary, stable: one migrator at a time per database

export async function migrate(url, { log = console.log } = {}) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(
      'create table if not exists schema_migrations (tag text primary key, applied_at timestamptz not null default now())',
    );
    const applied = new Set((await client.query('select tag from schema_migrations')).rows.map((r) => r.tag));
    const files = (await readdir(MIGRATIONS)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(join(MIGRATIONS, file), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (tag) values ($1)', [file]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw new Error(`migration ${file} failed: ${error.message}`, { cause: error });
      }
      log(`applied ${file}`);
      count += 1;
    }
    log(`${count} migration(s) applied`);
    return count;
  } finally {
    await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  migrate(url).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
