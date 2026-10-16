#!/usr/bin/env node
// The restore drill's check (Stage 10): is a restored copy of the database whole?
//
//   node scripts/restore-check.mjs <database url>
//
// Read-only. It checks that every migration in the repository is recorded, that every
// business table still has forced row-level security and its no-delete and audit triggers,
// that the rows came back (businesses, documents, payments, audit trail), and that every
// issued document still carries its snapshot with totals that add up (I2: the paper is the
// snapshot). Exit 0 when whole; 1 with the problems listed.
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { BROKEN_SNAPSHOT } from './snapshot-check.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.argv[2] ?? process.env.DATABASE_URL;
if (!url) {
  console.error('usage: node scripts/restore-check.mjs <database url>');
  process.exit(2);
}

// The tables apply_tenancy() protects with forced RLS (every business table).
const TENANT_TABLES = [
  'ai_calls',
  'business_files',
  'businesses',
  'customers',
  'document_files',
  'documents',
  'extraction_corrections',
  'extractions',
  'import_files',
  'import_rows',
  'imports',
  'items',
  'payments',
  'reminders_sent',
  'search_records',
  'series',
  'uploads',
];
// Tables whose trail must survive: the ones the audit trigger watches (search_records is derived, not audited).
const AUDITED = TENANT_TABLES.filter((t) => !['ai_calls', 'search_records'].includes(t));

const problems = [];
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const migrations = readdirSync(join(ROOT, 'packages', 'db', 'migrations'))
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();
  const applied = new Set((await client.query('select tag from schema_migrations')).rows.map((r) => r.tag));
  for (const m of migrations) if (!applied.has(m)) problems.push(`migration ${m} is not recorded`);

  const rls = new Map(
    (
      await client.query(
        `select relname, relrowsecurity, relforcerowsecurity from pg_class
          where relkind = 'r' and relnamespace = 'public'::regnamespace`,
      )
    ).rows.map((r) => [r.relname, r]),
  );
  for (const t of TENANT_TABLES) {
    const r = rls.get(t);
    if (!r) problems.push(`table ${t} is missing`);
    else if (!r.relrowsecurity || !r.relforcerowsecurity)
      problems.push(`table ${t} lost its forced row-level security`);
  }
  const triggers = new Set(
    (
      await client.query(
        `select c.relname || ':' || t.tgname as k from pg_trigger t join pg_class c on c.oid = t.tgrelid
          where not t.tgisinternal`,
      )
    ).rows.map((r) => r.k),
  );
  for (const t of TENANT_TABLES) if (!triggers.has(`${t}:refuse_delete`)) problems.push(`${t} lost refuse_delete`);
  for (const t of AUDITED) if (!triggers.has(`${t}:audit`)) problems.push(`${t} lost its audit trigger`);

  const count = async (sql) => Number((await client.query(sql)).rows[0].n);
  const counts = {
    businesses: await count('select count(*) as n from businesses'),
    documents: await count("select count(*) as n from documents where status <> 'draft'"),
    payments: await count('select count(*) as n from payments'),
    audit_events: await count('select count(*) as n from audit_events'),
  };
  if (!counts.businesses) problems.push('no businesses came back');
  if (counts.documents && !counts.audit_events) problems.push('documents came back without their audit trail');

  // I2: every issued or cancelled document keeps its snapshot, and the snapshot's totals add up.
  const broken = (
    await client.query(
      `select number from documents
        where status in ('issued', 'cancelled')
          and ${BROKEN_SNAPSHOT}
        limit 10`,
    )
  ).rows;
  for (const b of broken) problems.push(`document ${b.number}: snapshot missing or its total does not add up`);

  console.log(
    `restore-check: ${migrations.length} migrations, ${TENANT_TABLES.length} tenant tables; ` +
      Object.entries(counts)
        .map(([k, v]) => `${k} ${v}`)
        .join(', '),
  );
} finally {
  await client.end();
}
if (problems.length) {
  console.error('restore-check: NOT whole');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('restore-check: whole');
