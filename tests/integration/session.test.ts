import { describe, expect, it } from 'vitest';

import { createSession, deleteSession, membershipsOf, resolveScope } from '../../packages/db/src/auth';
import { getPool } from '../../packages/db/src/pool';
import { SEED, seedUser } from '../../packages/db/src/seed';
import { businessOf, seeded } from './helpers';

describe('sessions resolve to a scope (resolveScope)', () => {
  seeded();

  it('a session for a member resolves to their business, role and user settings', async () => {
    const sharma = businessOf('sharma');
    const ravi = seedUser('ravi')!;
    const s = await createSession({ userId: ravi.id, businessId: sharma.id, userAgent: 'vitest' });
    const r = await resolveScope(s.id, 'req-1');
    expect(r?.user.name).toBe('Ravi');
    expect(r?.business?.tradeName).toBe('Sharma Electricals');
    expect(r?.role).toBe('staff');
    expect(r?.scope).toEqual({ businessId: sharma.id, userId: ravi.id, role: 'staff', requestId: 'req-1' });
    expect(r?.user.theme).toBe('narangi');
  });

  it('a brand-new owner has a session without a business and no scope', async () => {
    const naya = seedUser('new')!;
    const s = await createSession({ userId: naya.id, businessId: null });
    const r = await resolveScope(s.id, 'req-2');
    expect(r?.user.name).toBe('Naya user');
    expect(r?.business).toBeNull();
    expect(r?.scope).toBeNull();
    expect(await membershipsOf(naya.id)).toEqual([]);
  });

  it('refuses a session for a business the user is not an active member of', async () => {
    const gupta = businessOf('gupta');
    const ravi = seedUser('ravi')!;
    await expect(createSession({ userId: ravi.id, businessId: gupta.id })).rejects.toThrow(/no active membership/);
  });

  it('an unknown, malformed, expired or deleted session resolves to nothing', async () => {
    expect(await resolveScope('not-a-uuid', 'r')).toBeNull();
    // Shaped like a uuid by length alone (Stage 2 review): null, never a database error.
    expect(await resolveScope('-'.repeat(36), 'r')).toBeNull();
    expect(await resolveScope('gggggggg-gggg-gggg-gggg-gggggggggggg', 'r')).toBeNull();
    expect(await resolveScope('00000000-0000-4000-8000-00000000ffff', 'r')).toBeNull();
    const sharma = businessOf('sharma');
    const s = await createSession({ userId: seedUser('sharma')!.id, businessId: sharma.id });
    await getPool().query("update sessions set expires_at = now() - interval '1 minute' where id = $1", [s.id]);
    expect(await resolveScope(s.id, 'r')).toBeNull();
    const s2 = await createSession({ userId: seedUser('sharma')!.id, businessId: sharma.id });
    await deleteSession(s2.id);
    expect(await resolveScope(s2.id, 'r')).toBeNull();
  });

  it('lists every seeded person with one active membership each (the switcher)', async () => {
    for (const b of SEED.businesses) {
      for (const key of [b.owner, b.staff, b.accountant]) {
        const ms = await membershipsOf(seedUser(key)!.id);
        expect(ms.map((m) => m.businessId)).toEqual([b.id]);
      }
    }
  });
});
