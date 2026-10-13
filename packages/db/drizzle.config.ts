import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle: the schema lives in src/schema.ts, migrations are plain SQL in
 * migrations/. `drizzle-kit check` in the watcher fails when the two drift.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './packages/db/src/schema.ts',
  out: './packages/db/migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5440/ekbill2_dev' },
  strict: true,
  verbose: false,
});
