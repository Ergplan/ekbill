import { createHash } from 'node:crypto';
import { statfsSync } from 'node:fs';

import { gstinCheckDigit } from '@ekbill/engine';
import pg from 'pg';

import { getPool } from './pool';
import type { TenantScope } from './scope';

/**
 * Stage 10's load seed: businesses tagged `load_test` (500 × 40 customers ×
 * 30 bills each at full scale: 600,000 documents; no PDFs rendered), issued
 * through the same issueDocument as a real bill so the snapshots, numbering
 * and audit trail are real. Idempotent: a business already complete is
 * skipped, a half-done one carries on from its last bill. Before seeding,
 * the disk it needs is estimated and the seed refuses to leave less than
 * 8 GB free (rule 18). `removeLoad` deletes only businesses tagged
 * load_test, and everything that hangs off them.
 */
export const FULL = { businesses: 500, customers: 40, billsPerCustomer: 30 } as const;
/** Measured on the build's database: an issued document 2.6 KB, its two audit rows 5.3 KB, a payment and indexes the rest. */
export const BYTES_PER_DOCUMENT = 10_000;
export const MIN_FREE_BYTES = 8 * 1024 ** 3;

const uuidOf = (key: string) => {
  const h = createHash('md5').update(`ekbill-load:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export const loadPhone = (n: number) => `+9170000${String(n).padStart(5, '0')}`;
const loadGstin = (n: number) => {
  const first14 = `27LOADT${String(n).padStart(4, '0')}Z1Z`;
  return `${first14}${gstinCheckDigit(first14)}`;
};

export interface LoadPlan {
  businesses: number;
  documents: number;
  bytes: number;
  freeBytes: number;
  ok: boolean;
}

export type LoadShape = { customers: number; billsPerCustomer: number };

export function planLoad(scale: number, freeBytes = statfsFree(), shape: LoadShape = FULL): LoadPlan {
  const businesses = Math.max(1, Math.round(FULL.businesses * scale));
  const documents = businesses * shape.customers * shape.billsPerCustomer;
  const bytes = documents * BYTES_PER_DOCUMENT;
  return { businesses, documents, bytes, freeBytes, ok: freeBytes - bytes >= MIN_FREE_BYTES };
}

function statfsFree(path = process.env.LOAD_DISK_PATH ?? '/'): number {
  const s = statfsSync(path);
  return Number(s.bavail) * Number(s.bsize);
}

export class LoadRefusedError extends Error {}

/** The day a bill is dated: spread over the year before `today`, oldest first. */
function dateFor(k: number, total: number, today: string): string {
  const t = Date.parse(`${today}T00:00:00Z`) - Math.round(((total - k) / total) * 360) * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export async function seedLoad(opts: {
  scale: number;
  today: string;
  log?: (s: string) => void;
  freeBytes?: number;
  /** Tests: fewer customers and bills per business than the full 40 × 30. */
  shape?: LoadShape;
}): Promise<{ businesses: number; issued: number }> {
  const log = opts.log ?? console.log;
  const shape = opts.shape ?? FULL;
  const plan = planLoad(opts.scale, opts.freeBytes, shape);
  log(
    `load seed: ${plan.businesses} businesses, ${plan.documents} documents, about ${(plan.bytes / 1024 ** 3).toFixed(1)} GB; ${(plan.freeBytes / 1024 ** 3).toFixed(1)} GB free`,
  );
  if (!plan.ok) throw new LoadRefusedError('the load seed would leave less than 8 GB free (rule 18); not started');
  const { createDraft, issueDocument } = await import('./repos/documents');
  const { createCustomer, listCustomers } = await import('./repos/customers');
  const { withTenant } = await import('./scope');
  const pool = getPool();
  let issued = 0;
  for (let n = 1; n <= plan.businesses; n += 1) {
    const businessId = uuidOf(`business-${n}`);
    const userId = uuidOf(`owner-${n}`);
    const seriesId = uuidOf(`series-${n}`);
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(
        "select set_config('app.actor_kind', 'system', true), set_config('app.request_id', 'load-seed', true), set_config('app.user_id', '', true), set_config('app.business_id', $1, true)",
        [businessId],
      );
      await client.query(`insert into users (id, phone_e164, name) values ($1, $2, $3) on conflict (id) do nothing`, [
        userId,
        loadPhone(n),
        `Load Owner ${n}`,
      ]);
      await client.query(
        `insert into businesses (id, legal_name, trade_name, created_by, registration_type, gstin, state_code, city,
                                 turnover_band, turnover_paise, e_invoicing_applies, load_test, setup_done_at)
         values ($1, $2, $2, $3, 'regular', $4, '27', 'Pune', '40l', 400000000, false, true, now())
         on conflict (id) do update set registration_type = 'regular', gstin = excluded.gstin, state_code = '27',
           turnover_band = '40l', turnover_paise = 400000000, e_invoicing_applies = false
         where businesses.load_test`,
        [businessId, `Load Test ${String(n).padStart(3, '0')}`, userId, loadGstin(n)],
      );
      await client.query(
        `insert into memberships (business_id, user_id, role, status, accepted_at)
         values ($1, $2, 'owner', 'active', now()) on conflict do nothing`,
        [businessId, userId],
      );
      await client.query(
        `insert into series (id, business_id, name, kind, prefix, padding, include_fy)
         values ($1, $2, 'Load', 'bill', 'LT-', 4, false) on conflict (id) do nothing`,
        [seriesId, businessId],
      );
      await client.query('update businesses set default_series_id = $2 where id = $1', [businessId, seriesId]);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
    const scope: TenantScope = { businessId, userId, role: 'owner', requestId: 'load-seed', actorKind: 'system' };
    const have = await withTenant(scope, async ({ client }) =>
      Number((await client.query("select count(*) as n from documents where status = 'issued'")).rows[0].n),
    );
    const total = shape.customers * shape.billsPerCustomer;
    if (have >= total) continue;
    const existing = await listCustomers(scope, { includeArchived: true });
    const people = [...existing];
    for (let c = existing.length + 1; c <= shape.customers; c += 1)
      people.push(
        await createCustomer(scope, {
          name: `Load Customer ${String(c).padStart(2, '0')}`,
          stateCode: c % 5 === 0 ? '29' : '27',
          city: c % 5 === 0 ? 'Bengaluru' : 'Pune',
        }),
      );
    // Bill k goes to customer k mod the customers, in date order, so a business carries on where it stopped.
    for (let k = have; k < total; k += 1) {
      const customer = people[k % shape.customers]!;
      const dateIso = dateFor(k, total, opts.today);
      const draft = await createDraft(scope, {
        seriesId,
        customer: { id: customer.id, name: customer.name, stateCode: customer.stateCode, phone: null, gstin: null },
        placeOfSupplyStateCode: customer.stateCode,
        dateIso,
        gstOn: true,
        lines: [
          {
            description: k % 3 ? 'AMC visit' : 'Wiring work',
            quantityMilli: 1000 + (k % 4) * 500,
            unitPricePaise: 150000 + (k % 7) * 25000,
            gstBp: 1800,
            taxRateChosen: true,
            hsnCode: '998719',
          },
        ],
      });
      await issueDocument(scope, { id: draft.id, today: dateIso });
      issued += 1;
    }
    // Most bills older than a month are paid in full; the rest are the dues.
    await withTenant(scope, async ({ client }) => {
      await client.query(
        `insert into payments (business_id, document_id, kind, amount_paise, date, method, created_by)
         select d.business_id, d.id, 'payment', (d.totals->>'totalPaise')::bigint, d.issue_date + 7, 'upi', $1
           from documents d
          where d.status = 'issued' and d.issue_date < current_date - 30 and abs(hashtext(d.id::text)) % 10 < 7
            and not exists (select 1 from payments p where p.document_id = d.id)`,
        [userId],
      );
    });
    log(`load seed: business ${n}/${plan.businesses} done`);
  }
  return { businesses: plan.businesses, issued };
}

/**
 * Removes every business tagged load_test and everything that belongs to it
 * (the one place rows are deleted: the load seed's own clean-up, master
 * prompt Stage 10). Needs the database owner: the no-delete and audit
 * triggers are bypassed for this transaction only (session_replication_role).
 */
export async function removeLoad(url: string, log: (s: string) => void = console.log): Promise<number> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('begin');
    await client.query('set local session_replication_role = replica');
    const ids = (await client.query<{ id: string }>('select id from businesses where load_test')).rows.map((r) => r.id);
    if (!ids.length) {
      await client.query('rollback');
      log('load remove: no load-test businesses');
      return 0;
    }
    const tables = (
      await client.query<{ table_name: string }>(
        `select table_name from information_schema.columns
          where table_schema = 'public' and column_name = 'business_id' and table_name <> 'businesses'`,
      )
    ).rows.map((r) => r.table_name);
    for (const t of tables)
      await client.query(`delete from ${pg.escapeIdentifier(t)} where business_id = any($1)`, [ids]);
    await client.query('delete from businesses where id = any($1) and load_test', [ids]);
    // The load owners, when they belong to nothing else.
    await client.query(
      `delete from users u where u.phone_e164 like '+9170000%'
          and not exists (select 1 from memberships m where m.user_id = u.id)
          and not exists (select 1 from businesses b where b.created_by = u.id)`,
    );
    await client.query('commit');
    log(`load remove: ${ids.length} load-test businesses removed`);
    return ids.length;
  } catch (e) {
    await client.query('rollback').catch(() => undefined);
    throw e;
  } finally {
    await client.end();
  }
}
