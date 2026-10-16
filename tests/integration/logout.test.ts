import { describe, expect, it } from 'vitest';

import { createSession, resolveScope } from '../../packages/db/src/auth';
import { seedUser } from '../../packages/db/src/seed';
import { businessOf, seeded } from './helpers';

/** Stage 11 review: there was no way to sign out, nor to end a lost phone's session. */
seeded();
const post = async (sessionId: string | null, everywhere = false) => {
  const route = await import('../../apps/web/app/api/auth/logout/route');
  return route.POST(
    new Request(`http://127.0.0.1:3000/api/auth/logout${everywhere ? '?everywhere=1' : ''}`, {
      method: 'POST',
      headers: sessionId ? { cookie: `eb-theme=narangi; eb-session=${sessionId}` } : {},
    }),
  );
};

describe('signing out', () => {
  it('ends this session and clears its cookie; the person’s other sessions stay', async () => {
    const user = seedUser('ravi')!;
    const business = businessOf('sharma').id;
    const here = await createSession({ userId: user.id, businessId: business });
    const there = await createSession({ userId: user.id, businessId: business });
    const res = await post(here.id);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/eb-session=;.*Expires=Thu, 01 Jan 1970/i);
    expect(await resolveScope(here.id, 't')).toBeNull();
    expect(await resolveScope(there.id, 't')).not.toBeNull();
  });

  it('everywhere: every session of the person ends, and no one else’s', async () => {
    const user = seedUser('ravi')!;
    const other = seedUser('meera')!;
    const business = businessOf('sharma').id;
    const a = await createSession({ userId: user.id, businessId: business });
    const b = await createSession({ userId: user.id, businessId: business });
    const hers = await createSession({ userId: other.id, businessId: business });
    expect((await (await post(a.id, true)).json()).ended).toBeGreaterThanOrEqual(2);
    expect(await resolveScope(a.id, 't')).toBeNull();
    expect(await resolveScope(b.id, 't')).toBeNull();
    expect(await resolveScope(hers.id, 't')).not.toBeNull();
  });

  it('without a session it is a quiet no-op', async () => {
    const res = await post(null);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ended: 0 });
  });
});
