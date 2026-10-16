import { getPool } from './pool';

/**
 * The few reads the worker makes across businesses (Stage 6): which
 * businesses have issued bills, and who owns each, so a daily job can act
 * per business through withTenant as that owner (actor 'system'). It runs
 * on the login role, outside any tenant; it returns ids only, never a
 * business's rows.
 */
export async function businessesWithBills(): Promise<Array<{ businessId: string; ownerId: string }>> {
  const { rows } = await getPool().query<{ business_id: string; owner_id: string }>(
    `select distinct d.business_id, m.user_id as owner_id
       from documents d
       join memberships m on m.business_id = d.business_id and m.role = 'owner' and m.status = 'active'
       join businesses b on b.id = d.business_id
      -- Real, standing businesses only (Stage 11 review): the load seed's 500 would have the nightly index make
      -- embedding calls for synthetic bills, and an archived business has nobody to remind.
      where d.status = 'issued' and d.kind <> 'credit_note' and b.status = 'active' and not b.load_test`,
  );
  return rows.map((r) => ({ businessId: r.business_id, ownerId: r.owner_id }));
}

/**
 * The queue as /api/health and /api/metrics report it (Stage 10): per job kind, the jobs waiting
 * (created or retrying) and the age of the oldest in seconds. Empty before the worker's first start.
 */
export async function queueStatus(): Promise<Array<{ name: string; waiting: number; oldestSeconds: number }>> {
  try {
    const { rows } = await getPool().query<{ name: string; waiting: string; oldest: string | null }>(
      `select name, count(*) as waiting, extract(epoch from now() - min(created_on)) as oldest
         from pgboss.job where state in ('created', 'retry') group by name order by name`,
    );
    return rows.map((r) => ({
      name: r.name,
      waiting: Number(r.waiting),
      oldestSeconds: Math.round(Number(r.oldest ?? 0)),
    }));
  } catch {
    return [];
  }
}

/** Counts for /api/metrics: whole-installation totals, never a business's rows. */
export async function installationCounts(): Promise<Record<string, number>> {
  const { rows } = await getPool().query<Record<string, string>>(
    `select (select count(*) from businesses where status = 'active' and not load_test) as businesses,
            (select count(*) from businesses where load_test) as load_test_businesses,
            (select count(*) from documents where status = 'issued') as documents_issued,
            (select count(*) from payments where reversed_at is null) as payments,
            (select count(*) from ai_calls where at > now() - interval '1 hour') as ai_calls_last_hour,
            (select coalesce(sum(cost_micros), 0) from ai_calls where at > now() - interval '1 day') as ai_cost_micros_last_day,
            (select count(*) from sessions where expires_at > now()) as sessions_live`,
  );
  return Object.fromEntries(Object.entries(rows[0] ?? {}).map(([k, v]) => [k, Number(v)]));
}
