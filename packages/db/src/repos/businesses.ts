import { eq, sql } from 'drizzle-orm';

import * as schema from '../schema';
import { withTenant, withUser, type TenantScope } from '../scope';
import { allow, NotFoundError, type RoleProbe, type TenancyProbe } from './allow';

export interface Business {
  id: string;
  legalName: string;
  tradeName: string;
  status: 'active' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

/** Who may make each write (8.3; I8). The generated roles test holds every role to this table. */
export const allowedRoles = {
  rename: ['owner'],
  archive: ['owner'],
} as const satisfies Record<string, readonly TenantScope['role'][]>;

export async function getBusiness(scope: TenantScope): Promise<Business> {
  return withTenant(scope, async ({ db }) => {
    const row = (await db.select().from(schema.businesses).where(eq(schema.businesses.id, scope.businessId)))[0];
    if (!row) throw new NotFoundError('business');
    return row as Business;
  });
}

export async function rename(scope: TenantScope, input: { legalName?: string; tradeName?: string }): Promise<Business> {
  allow(scope, allowedRoles.rename, 'rename the business');
  return withTenant(scope, async ({ db }) => {
    const [row] = await db
      .update(schema.businesses)
      .set({
        ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
        ...(input.tradeName !== undefined ? { tradeName: input.tradeName } : {}),
        updatedAt: sql`now()`,
      })
      .where(eq(schema.businesses.id, scope.businessId))
      .returning();
    if (!row) throw new NotFoundError('business');
    return row as Business;
  });
}

export async function archive(scope: TenantScope): Promise<Business> {
  allow(scope, allowedRoles.archive, 'archive the business');
  return withTenant(scope, async ({ db }) => {
    const [row] = await db
      .update(schema.businesses)
      .set({ status: 'archived', updatedAt: sql`now()` })
      .where(eq(schema.businesses.id, scope.businessId))
      .returning();
    if (!row) throw new NotFoundError('business');
    return row as Business;
  });
}

/**
 * A brand-new owner's business: no scope exists yet, so this runs with the
 * user alone, chooses the id first and sets it as the scope of the insert
 * (the policy on businesses is id = app_business_id()). One transaction:
 * the business and its owner membership.
 */
export async function createBusiness(
  who: { userId: string; requestId: string },
  input: { legalName: string; tradeName: string },
): Promise<Business> {
  return withUser(who, async ({ db, client }) => {
    const id = (await client.query<{ id: string }>('select gen_random_uuid() as id')).rows[0]!.id;
    await client.query("select set_config('app.business_id', $1, true)", [id]);
    const [row] = await db
      .insert(schema.businesses)
      .values({ id, legalName: input.legalName, tradeName: input.tradeName, createdBy: who.userId })
      .returning();
    await db.insert(schema.memberships).values({
      businessId: id,
      userId: who.userId,
      role: 'owner',
      status: 'active',
      invitedBy: who.userId,
      acceptedAt: sql`now()`,
    });
    return row as Business;
  });
}

// --- probes for the generated tests (not part of the product API)
export const roleProbes: Record<keyof typeof allowedRoles, RoleProbe> = {
  rename: (scope) => rename(scope, { tradeName: 'Probe Traders' }),
  archive: (scope) => archive(scope),
};
export const tenancyProbes: TenancyProbe[] = [
  {
    name: 'getBusiness returns only its own business',
    run: async (scope) => ({ touched: [(await getBusiness(scope)).id] }),
  },
  {
    name: 'rename touches only its own business',
    run: async (scope) => ({ touched: [(await rename(scope, { tradeName: 'Renamed by A' })).id] }),
  },
];
