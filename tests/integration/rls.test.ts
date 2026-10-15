import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { businessOf, seeded } from './helpers';

/**
 * I1 and I6 proven on raw connections, the way an attacker or a bug would
 * reach the database: as the application role with no business set, every
 * tenant table is empty; as a model actor, no authoritative table accepts a write.
 */
describe('row-level security and the model-actor refusal (raw connections)', () => {
  seeded();
  let client: pg.Client;
  beforeAll(async () => {
    client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
  });
  afterAll(async () => {
    await client.end();
  });

  it('the application role with no app.business_id sees 0 rows of every tenant table', async () => {
    await client.query('begin');
    await client.query('set local role ekbill_app');
    for (const table of ['businesses', 'ai_calls', 'audit_events']) {
      const r = await client.query(`select count(*)::int as n from ${table}`);
      expect((r.rows[0] as { n: number }).n, table).toBe(0);
    }
    await client.query('rollback');
  });

  it('the application role scoped to A sees A and not B (the cross-tenant query of the report)', async () => {
    const a = businessOf('sharma');
    const b = businessOf('gupta');
    await client.query('begin');
    await client.query('set local role ekbill_app');
    await client.query("select set_config('app.business_id', $1, true)", [a.id]);
    const r = await client.query('select id from businesses order by id');
    expect(r.rows.map((x) => (x as { id: string }).id)).toEqual([a.id]);
    const cross = await client.query('select count(*)::int as n from businesses where id = $1', [b.id]);
    expect((cross.rows[0] as { n: number }).n).toBe(0);
    await client.query('rollback');
  });

  it('a write outside the scope is refused by the policy', async () => {
    const a = businessOf('sharma');
    const b = businessOf('gupta');
    await client.query('begin');
    await client.query('set local role ekbill_app');
    await client.query("select set_config('app.business_id', $1, true)", [a.id]);
    const r = await client.query('update businesses set trade_name = $1 where id = $2', ['Hijacked', b.id]);
    expect(r.rowCount).toBe(0);
    await client.query('rollback');
  });

  it('a model actor may not insert into an authoritative table, even inside a valid scope', async () => {
    const a = businessOf('sharma');
    await client.query('begin');
    await client.query('set local role ekbill_app');
    await client.query(
      "select set_config('app.business_id', $1, true), set_config('app.actor_kind', 'model', true), set_config('app.user_id', $2, true)",
      [a.id, '00000000-0000-4000-8000-000000000001'],
    );
    await expect(
      client.query('update businesses set trade_name = $1 where id = $2', ['By a model', a.id]),
    ).rejects.toThrow(/model may not write/);
    await client.query('rollback');
    await client.query('begin');
    await client.query('set local role ekbill_app');
    await client.query("select set_config('app.business_id', $1, true), set_config('app.actor_kind', 'model', true)", [
      a.id,
    ]);
    await expect(
      client.query(
        "insert into memberships (business_id, user_id, role, status) values ($1, '00000000-0000-4000-8000-000000000002', 'staff', 'active')",
        [a.id],
      ),
    ).rejects.toThrow(/model may not write/);
    await client.query('rollback');
  });

  it('the application role cannot write the audit trail directly', async () => {
    const a = businessOf('sharma');
    await client.query('begin');
    await client.query('set local role ekbill_app');
    await client.query("select set_config('app.business_id', $1, true)", [a.id]);
    await expect(
      client.query(
        "insert into audit_events (business_id, actor_kind, table_name, row_id, action) values ($1, 'user', 'x', 'y', 'INSERT')",
        [a.id],
      ),
    ).rejects.toThrow(/permission denied/);
    await client.query('rollback');
  });
});
