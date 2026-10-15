import { and, eq, sql } from 'drizzle-orm';

import * as schema from '../schema';
import { withTenant, type Role, type TenantScope } from '../scope';
import { allow, NotFoundError, type RoleProbe, type TenancyProbe } from './allow';

export interface Member {
  id: string;
  userId: string;
  name: string;
  phoneE164: string;
  role: Role;
  status: 'invited' | 'active' | 'removed';
  invitedAt: Date;
  acceptedAt: Date | null;
}

/** Only the owner shapes the team (8.3). */
export const allowedRoles = {
  invite: ['owner'],
  remove: ['owner'],
} as const satisfies Record<string, readonly Role[]>;

const columns = {
  id: schema.memberships.id,
  userId: schema.memberships.userId,
  name: schema.users.name,
  phoneE164: schema.users.phoneE164,
  role: schema.memberships.role,
  status: schema.memberships.status,
  invitedAt: schema.memberships.invitedAt,
  acceptedAt: schema.memberships.acceptedAt,
};

/** The business's people (memberships has no RLS: the where clause is the fence, and the test holds it). */
export async function listMembers(scope: TenantScope): Promise<Member[]> {
  return withTenant(scope, async ({ db }) => {
    const rows = await db
      .select(columns)
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(eq(schema.memberships.businessId, scope.businessId))
      .orderBy(schema.memberships.invitedAt);
    return rows as Member[];
  });
}

/**
 * Invite a person by phone as staff or accountant (a second owner is never
 * invited: one active owner per business). A person unknown to EkBill gets
 * a users row with the name given; an existing one keeps their own name.
 * Stage 10 sends the WhatsApp invite; until then the membership is created
 * active, so the build's switcher can use it.
 */
export async function invite(
  scope: TenantScope,
  input: { phoneE164: string; name: string; role: 'staff' | 'accountant' },
): Promise<Member> {
  allow(scope, allowedRoles.invite, 'invite a member');
  return withTenant(scope, async ({ db }) => {
    const existing = (await db.select().from(schema.users).where(eq(schema.users.phoneE164, input.phoneE164)))[0];
    const user =
      existing ??
      (await db.insert(schema.users).values({ phoneE164: input.phoneE164, name: input.name.trim() }).returning())[0]!;
    const [m] = await db
      .insert(schema.memberships)
      .values({
        businessId: scope.businessId,
        userId: user.id,
        role: input.role,
        status: 'active',
        invitedBy: scope.userId,
        acceptedAt: sql`now()`,
      })
      .onConflictDoUpdate({
        target: [schema.memberships.businessId, schema.memberships.userId],
        set: { role: input.role, status: 'active', invitedBy: scope.userId, invitedAt: sql`now()` },
      })
      .returning();
    return {
      id: m!.id,
      userId: user.id,
      name: user.name,
      phoneE164: user.phoneE164,
      role: m!.role as Role,
      status: m!.status as Member['status'],
      invitedAt: m!.invitedAt,
      acceptedAt: m!.acceptedAt,
    };
  });
}

/** Remove a member (status removed; nothing is deleted). An owner cannot remove themself. */
export async function remove(scope: TenantScope, input: { userId: string }): Promise<Member> {
  allow(scope, allowedRoles.remove, 'remove a member');
  if (input.userId === scope.userId) throw new NotFoundError('member'); // the owner stays
  return withTenant(scope, async ({ db }) => {
    const [m] = await db
      .update(schema.memberships)
      .set({ status: 'removed' })
      .where(
        and(
          eq(schema.memberships.businessId, scope.businessId),
          eq(schema.memberships.userId, input.userId),
          eq(schema.memberships.status, 'active'),
        ),
      )
      .returning();
    if (!m) throw new NotFoundError('member');
    const user = (await db.select().from(schema.users).where(eq(schema.users.id, m.userId)))[0]!;
    return {
      id: m.id,
      userId: m.userId,
      name: user.name,
      phoneE164: user.phoneE164,
      role: m.role as Role,
      status: 'removed',
      invitedAt: m.invitedAt,
      acceptedAt: m.acceptedAt,
    };
  });
}

export const roleProbes: Record<keyof typeof allowedRoles, RoleProbe> = {
  invite: (scope) => invite(scope, { phoneE164: '+919800000099', name: 'Probe Staff', role: 'staff' }),
  remove: async (scope) => {
    const m = await invite(scope, { phoneE164: '+919800000098', name: 'Probe Gone', role: 'staff' });
    return remove(scope, { userId: m.userId });
  },
};
export const tenancyProbes: TenancyProbe[] = [
  {
    name: 'listMembers lists only its own business',
    run: async (scope, other) => {
      const rows = await listMembers(scope);
      return { touched: rows.some((r) => r.userId === other.userId) ? [other.businessId] : [scope.businessId] };
    },
  },
  {
    name: "remove cannot reach another business's member",
    run: async (scope, other) => {
      try {
        await remove(scope, { userId: other.userId });
        return { touched: [other.businessId] };
      } catch (e) {
        return { touched: e instanceof NotFoundError ? [] : [other.businessId] };
      }
    },
  },
];
