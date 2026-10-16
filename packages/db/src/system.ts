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
      where d.status = 'issued' and d.kind <> 'credit_note'`,
  );
  return rows.map((r) => ({ businessId: r.business_id, ownerId: r.owner_id }));
}
