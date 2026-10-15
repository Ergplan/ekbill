import { describe, expect, it } from 'vitest';

import { getPool } from '../../packages/db/src/pool';
import * as businesses from '../../packages/db/src/repos/businesses';
import * as memberships from '../../packages/db/src/repos/memberships';
import { withTenant } from '../../packages/db/src/scope';
import { scopeFor, seeded } from './helpers';

/** I7: one audit row per authoritative write, with before and after, the actor and the request id. */
describe('the audit trigger', () => {
  seeded();

  it('appends exactly one row per write, with before and after, actor and request id', async () => {
    const scope = { ...(await scopeFor('sharma', 'owner')), requestId: `audit-${Date.now()}` };
    const countBefore = await count(scope.businessId);
    const renamed = await businesses.rename(scope, { tradeName: `Sharma ${scope.requestId}` });
    const rows = await withTenant(scope, async ({ client }) => {
      const r = await client.query(
        'select * from audit_events where business_id = $1 and request_id = $2 order by id',
        [scope.businessId, scope.requestId],
      );
      return r.rows as Array<Record<string, unknown>>;
    });
    expect(rows).toHaveLength(1);
    expect(await count(scope.businessId)).toBe(countBefore + 1);
    const row = rows[0]!;
    expect(row.table_name).toBe('businesses');
    expect(row.action).toBe('UPDATE');
    expect(row.actor_user_id).toBe(scope.userId);
    expect(row.actor_kind).toBe('user');
    expect(row.row_id).toBe(renamed.id);
    expect((row.before as { trade_name: string }).trade_name).not.toBe(renamed.tradeName);
    expect((row.after as { trade_name: string }).trade_name).toBe(renamed.tradeName);
  });

  it('audits a membership insert (business id from the row) and never a read', async () => {
    const scope = { ...(await scopeFor('sharma', 'owner')), requestId: `audit-m-${Date.now()}` };
    await memberships.listMembers(scope);
    const m = await memberships.invite(scope, { phoneE164: '+919800000077', name: 'Audit Staff', role: 'staff' });
    const rows = await withTenant(scope, async ({ client }) => {
      const r = await client.query('select table_name, action, row_id from audit_events where request_id = $1', [
        scope.requestId,
      ]);
      return r.rows as Array<{ table_name: string; action: string; row_id: string }>;
    });
    expect(rows.filter((r) => r.table_name === 'memberships').map((r) => r.action)).toContain('INSERT');
    expect(rows.find((r) => r.table_name === 'memberships')?.row_id).toBe(m.id);
  });

  it('is append-only: the application role cannot change or remove a row', async () => {
    const scope = await scopeFor('sharma', 'owner');
    await expect(
      withTenant(scope, ({ client }) =>
        client.query('update audit_events set action = $1 where business_id = $2', ['X', scope.businessId]),
      ),
    ).rejects.toThrow();
    await expect(
      withTenant(scope, ({ client }) =>
        client.query('delete from audit_events where business_id = $1', [scope.businessId]),
      ),
    ).rejects.toThrow();
  });

  it('refuses a delete on an audited table (8.3: archive, never delete), for the app role and the owner alike', async () => {
    const scope = await scopeFor('sharma', 'owner');
    // The application role has no DELETE privilege at all...
    await expect(
      withTenant(scope, ({ client }) => client.query('delete from businesses where id = $1', [scope.businessId])),
    ).rejects.toThrow(/permission denied/);
    // ...and the table owner (the migrating login role) is stopped by the trigger.
    await expect(getPool().query('delete from businesses where id = $1', [scope.businessId])).rejects.toThrow(
      /nothing is deleted/,
    );
  });
});

async function count(businessId: string): Promise<number> {
  const r = await getPool().query('select count(*)::int as n from audit_events where business_id = $1', [businessId]);
  return (r.rows[0] as { n: number }).n;
}
