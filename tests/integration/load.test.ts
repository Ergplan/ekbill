import { describe, expect, it } from 'vitest';

import { getPool } from '../../packages/db/src/pool';
import { MIN_FREE_BYTES, loadPhone, planLoad, removeLoad, seedLoad } from '../../packages/db/src/load';
import { businessesWithBills } from '../../packages/db/src/system';
import { seeded } from './helpers';

/**
 * Stage 10's load seed: real bills through issueDocument for businesses tagged load_test,
 * idempotent, refusing to leave less than 8 GB free; and its removal, which takes the load-test
 * businesses and everything hanging off them, and nothing else.
 */
const shape = { customers: 2, billsPerCustomer: 3 };
const count = async (sql: string, args: unknown[] = []) => Number((await getPool().query(sql, args)).rows[0].n);

seeded();

describe('the load seed', () => {
  it('plans the full run as 600,000 documents and refuses what would leave less than 8 GB', () => {
    const full = planLoad(1, 100 * 1024 ** 3);
    expect(full).toMatchObject({ businesses: 500, documents: 600_000, ok: true });
    expect(planLoad(1, full.bytes + MIN_FREE_BYTES - 1).ok).toBe(false);
  });

  it('seeds real bills once, carries on idempotently, and refuses on a full disk', async () => {
    await expect(
      seedLoad({ scale: 0.002, today: '2026-10-15', log: () => undefined, freeBytes: 1, shape }),
    ).rejects.toThrow(/8 GB/);
    const before = await count('select count(*) as n from documents');
    const first = await seedLoad({ scale: 0.002, today: '2026-10-15', log: () => undefined, freeBytes: 1e12, shape });
    expect(first).toEqual({ businesses: 1, issued: 6 });
    expect((await count('select count(*) as n from documents')) - before).toBe(6);
    const again = await seedLoad({ scale: 0.002, today: '2026-10-15', log: () => undefined, freeBytes: 1e12, shape });
    expect(again.issued).toBe(0);
    const b = (await getPool().query('select id from businesses where load_test')).rows;
    expect(b).toHaveLength(1);
    expect(
      await count("select count(*) as n from documents where business_id = $1 and number like 'LT-%'", [b[0].id]),
    ).toBe(6);
    expect(await count('select count(*) as n from users where phone_e164 = $1', [loadPhone(1)])).toBe(1);
    // Their snapshots are real: the issue path wrote them, and the audit trail has them.
    expect(
      await count('select count(*) as n from documents where business_id = $1 and issued_snapshot is null', [b[0].id]),
    ).toBe(0);
    expect(await count('select count(*) as n from audit_events where business_id = $1', [b[0].id])).toBeGreaterThan(6);
    // The nightly jobs leave them alone (Stage 11 review: the index made embedding calls for synthetic bills).
    const nightly = (await businessesWithBills()).map((x) => x.businessId);
    expect(nightly).not.toContain(b[0].id);
    expect(nightly.length).toBeGreaterThan(0);
  });

  it('the removal takes only the load-test businesses and what hangs off them', async () => {
    const others = await count(
      'select count(*) as n from documents d join businesses b on b.id = d.business_id where not b.load_test',
    );
    const otherAudit = await count(
      'select count(*) as n from audit_events a join businesses b on b.id = a.business_id where not b.load_test',
    );
    // A real person whose phone starts +91 70000 and who has no business yet (signed in, not set up): not the load's.
    await getPool().query(
      "insert into users (phone_e164, name) values ('+917000099999', 'Real person') on conflict (phone_e164) do nothing",
    );
    expect(await removeLoad(process.env.DATABASE_URL!, () => undefined)).toBe(1);
    expect(await count("select count(*) as n from users where phone_e164 = '+917000099999'")).toBe(1);
    expect(await count('select count(*) as n from businesses where load_test')).toBe(0);
    expect(await count("select count(*) as n from documents where number like 'LT-%'")).toBe(0);
    expect(await count('select count(*) as n from users where phone_e164 = $1', [loadPhone(1)])).toBe(0);
    expect(
      await count(
        'select count(*) as n from documents d join businesses b on b.id = d.business_id where not b.load_test',
      ),
    ).toBe(others);
    expect(
      await count(
        'select count(*) as n from audit_events a join businesses b on b.id = a.business_id where not b.load_test',
      ),
    ).toBe(otherAudit);
    // Outside the removal, the no-delete rule still holds.
    await expect(getPool().query('delete from series where false or true')).rejects.toThrow(/nothing is deleted/);
    expect(await removeLoad(process.env.DATABASE_URL!, () => undefined)).toBe(0);
  });
});
