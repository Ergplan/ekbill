import { describe, expect, it } from 'vitest';

import {
  acceptInvites,
  createSession,
  membershipsOf,
  resolveScope,
  userByPhone,
  userForPhone,
} from '../../packages/db/src/auth';
import * as businesses from '../../packages/db/src/repos/businesses';
import { ForbiddenError, NotFoundError } from '../../packages/db/src/repos/allow';
import * as memberships from '../../packages/db/src/repos/memberships';
import { getPool } from '../../packages/db/src/pool';
import { businessOf, scopeFor, seeded } from './helpers';

/**
 * Stage 9: the invite lifecycle. The owner invites a phone with a role; the
 * membership waits until that phone signs in, then the person acts for the
 * business in that role; the owner changes the role, then removes them, and
 * the person's session no longer reaches the business.
 */
seeded();
const phone = () => `+9198${String(Date.now()).slice(-8)}`;

describe('invites (owner only)', () => {
  it('invite → sign in → act → change role → remove → no access', async () => {
    const owner = await scopeFor('sharma', 'owner');
    const number = phone();
    const invited = await memberships.invite(owner, { phoneE164: number, name: 'Kavita', role: 'accountant' });
    expect(invited).toMatchObject({ status: 'invited', role: 'accountant', name: 'Kavita', acceptedAt: null });
    const user = (await userByPhone(number))!;
    // Not a member until that phone signs in.
    expect(await membershipsOf(user.id)).toEqual([]);
    expect(await acceptInvites(user.id)).toBe(1);
    const [m] = await membershipsOf(user.id);
    expect(m).toMatchObject({ businessId: businessOf('sharma').id, role: 'accountant' });
    const session = await createSession({ userId: user.id, businessId: m!.businessId });
    expect((await resolveScope(session.id, 'team-test'))?.scope).toMatchObject({ role: 'accountant' });

    // The owner changes the role; the next request sees it.
    await memberships.changeRole(owner, { userId: user.id, role: 'staff' });
    const again = await createSession({ userId: user.id, businessId: m!.businessId });
    expect((await resolveScope(again.id, 'team-test'))?.scope).toMatchObject({ role: 'staff' });

    // Removed: every session of theirs stops reaching the business.
    await memberships.remove(owner, { userId: user.id });
    expect((await resolveScope(again.id, 'team-test'))?.scope ?? null).toBeNull();
    expect(await membershipsOf(user.id)).toEqual([]);
    const listed = await memberships.listMembers(owner);
    expect(listed.find((x) => x.userId === user.id)?.status).toBe('removed');
  });

  it('an invite can be withdrawn before it is accepted, and re-sent', async () => {
    const owner = await scopeFor('sharma', 'owner');
    const number = phone();
    const m = await memberships.invite(owner, { phoneE164: number, name: 'Raju', role: 'staff' });
    await memberships.remove(owner, { userId: m.userId });
    expect(await acceptInvites(m.userId)).toBe(0);
    const back = await memberships.invite(owner, { phoneE164: number, name: 'Raju', role: 'staff' });
    expect(back.status).toBe('invited');
    expect(await acceptInvites(m.userId)).toBe(1);
  });

  it('accepting is audited as the person, under the request (Stage 9 review)', async () => {
    const owner = await scopeFor('sharma', 'owner');
    const m = await memberships.invite(owner, { phoneE164: phone(), name: 'Meena', role: 'staff' });
    const requestId = `accept-${Date.now()}`;
    expect(await acceptInvites(m.userId, requestId)).toBe(1);
    const r = await getPool().query(
      'select actor_user_id::text as actor, table_name, action, row_id from audit_events where request_id = $1',
      [requestId],
    );
    expect(r.rows).toEqual([{ actor: m.userId, table_name: 'memberships', action: 'UPDATE', row_id: m.id }]);
  });

  it('never touches the owner, never invites yourself; staff and the accountant cannot shape the team', async () => {
    const owner = await scopeFor('sharma', 'owner');
    const sharma = businessOf('sharma');
    await expect(
      memberships.invite(owner, { phoneE164: '+919822012345', name: 'Me', role: 'staff' }),
    ).rejects.toMatchObject({
      code: 'self',
    });
    await expect(memberships.changeRole(owner, { userId: owner.userId, role: 'staff' })).rejects.toMatchObject({
      code: 'self',
    });
    await expect(memberships.remove(owner, { userId: owner.userId })).rejects.toBeInstanceOf(NotFoundError);
    for (const role of ['staff', 'accountant'] as const) {
      const scope = await scopeFor('sharma', role);
      await expect(memberships.invite(scope, { phoneE164: phone(), name: 'X', role: 'staff' })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    }
    // Another business's owner cannot be invited as staff here and so demoted.
    const gupta = await scopeFor('gupta', 'owner');
    const theirOwner = (await memberships.listMembers(gupta)).find((x) => x.role === 'owner')!;
    const inSharma = await memberships.invite(owner, { phoneE164: theirOwner.phoneE164, name: 'x', role: 'staff' });
    expect(inSharma.status).toBe('invited');
    expect((await memberships.listMembers(gupta)).find((x) => x.userId === theirOwner.userId)?.role).toBe('owner');
    void sharma;
  });

  // Stage 11 review: the memberships came back in scan order, and a sign-in lands in the first, so an owner who
  // accepted someone's invite could find themselves in that business as staff, not in their own.
  it('an owner invited elsewhere still lands in their own business first', async () => {
    const number = phone();
    const person = await userForPhone(number);
    const own = await businesses.createBusiness(
      { userId: person.id, requestId: 'team-test' },
      { legalName: 'Apni Dukaan', tradeName: 'Apni Dukaan' },
    );
    await memberships.invite(await scopeFor('sharma', 'owner'), { phoneE164: number, name: 'X', role: 'staff' });
    expect(await acceptInvites(person.id)).toBe(1);
    const ms = await membershipsOf(person.id);
    expect(ms.map((m) => m.role)).toEqual(['owner', 'staff']);
    expect(ms[0]!.businessId).toBe(own.id);
  });
});
