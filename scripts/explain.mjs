#!/usr/bin/env node
// EXPLAIN ANALYZE for the list and dues queries (Stage 10), on the load-test business with the
// most bills: the bills list, the dues, the balances of a page of bills, a GST quarter, the
// customer directory, and Poocho's "what changed" scan. Read-only.
//
//   node scripts/explain.mjs <database url> [--plans]
import pg from 'pg';

const url = process.argv[2] ?? process.env.DATABASE_URL;
const plans = process.argv.includes('--plans');
const client = new pg.Client({ connectionString: url });
await client.connect();
const b = (
  await client.query(
    `select d.business_id as id, count(*) as n from documents d join businesses x on x.id = d.business_id
      where x.load_test group by 1 order by 2 desc limit 1`,
  )
).rows[0];
if (!b) {
  console.error('explain: no load-test business; run the load seed first');
  process.exit(1);
}
const OUTSTANDING = `((d.totals->>'totalPaise')::bigint
  - coalesce((select sum(p.amount_paise) from payments p where p.document_id = d.id and p.reversed_at is null), 0)
  - coalesce((select sum((n.totals->>'totalPaise')::bigint) from documents n
               where n.linked_document_id = d.id and n.kind = 'credit_note' and n.status = 'issued'), 0))`;
const queries = {
  'bills list (500 newest)': `select d.id, d.number, (d.totals->>'totalPaise')::bigint from documents d
     where d.business_id = $1 and d.status <> 'draft' and d.kind <> 'credit_note'
     order by d.issue_date desc, d.issued_at desc limit 500`,
  'dues (outstanding first)': `select d.id from documents d where d.business_id = $1 and d.status = 'issued'
     and d.kind <> 'credit_note' and ${OUTSTANDING} > 0 order by d.issue_date desc, d.issued_at desc limit 500`,
  'balances of a page': `select p.document_id, p.amount_paise from payments p where p.document_id in
     (select id from documents where business_id = $1 order by issue_date desc limit 500)`,
  'GST quarter': `select d.id, d.issued_snapshot from documents d where d.business_id = $1
     and d.status in ('issued', 'cancelled') and d.issue_date between current_date - 90 and current_date`,
  'customer directory': `select * from customers where business_id = $1 and not archived
     order by last_billed_at desc nulls last, name`,
  "Poocho's change scan": `select d.id from documents d
     left join search_records s on s.business_id = d.business_id and s.kind = 'bill' and s.source_id = d.id
     where d.business_id = $1 and d.status in ('issued', 'cancelled') and s.id is null limit 500`,
};
console.log(`business ${b.id}: ${b.n} documents`);
for (const [name, sql] of Object.entries(queries)) {
  const { rows } = await client.query(`explain (analyze, buffers) ${sql}`, [b.id]);
  const text = rows.map((r) => r['QUERY PLAN']);
  const time = text.find((l) => l.startsWith('Execution Time'));
  console.log(`${name.padEnd(26)} ${time}`);
  if (plans) console.log(text.map((l) => `    ${l}`).join('\n'));
}
await client.end();
