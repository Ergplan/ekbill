import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getPool } from '../../packages/db/src/pool';

/**
 * Stage 11: the audit pack's data model says what the database is. Every table it lists exists
 * with that many columns, and its RLS and audit columns match pg_class and pg_trigger on a
 * database the migrations built (the global setup's).
 */
describe('docs/audit/DATA-MODEL.md', () => {
  it('matches the migrated database: tables, column counts, RLS and audit', async () => {
    const md = readFileSync(join(__dirname, '../../docs/audit/DATA-MODEL.md'), 'utf8');
    const rows = [
      ...md.matchAll(/^\| \[`([a-z_]+)`\]\(#[a-z_]+\) *\| (\d+) *\| (forced|on|no) *\| (yes|no) *\|$/gm),
    ].map((m) => ({ table: m[1]!, columns: Number(m[2]), rls: m[3]!, audit: m[4]! }));
    const { rows: db } = await getPool().query<{
      relname: string;
      columns: string;
      rls: boolean;
      forced: boolean;
      audited: boolean;
    }>(
      `select c.relname,
              (select count(*) from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as columns,
              c.relrowsecurity as rls, c.relforcerowsecurity as forced,
              exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'audit') as audited
         from pg_class c
        where c.relkind in ('r', 'p') and c.relnamespace = 'public'::regnamespace and c.relname <> 'schema_migrations'`,
    );
    expect(rows.map((r) => r.table).sort()).toEqual(db.map((r) => r.relname).sort());
    for (const r of rows) {
      const d = db.find((x) => x.relname === r.table)!;
      expect({ table: r.table, columns: r.columns }).toEqual({ table: r.table, columns: Number(d.columns) });
      expect({ table: r.table, rls: r.rls }).toEqual({
        table: r.table,
        rls: d.forced ? 'forced' : d.rls ? 'on' : 'no',
      });
      expect({ table: r.table, audit: r.audit }).toEqual({ table: r.table, audit: d.audited ? 'yes' : 'no' });
    }
  });
});
