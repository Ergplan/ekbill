import { and, asc, eq, sql } from 'drizzle-orm';

import { checkCustomer, type CustomerField, type CustomerInput, type ExistingCustomer, type Say } from '@ekbill/engine';

import * as schema from '../schema';
import { withTenant, type Role, type TenantScope } from '../scope';
import { allow, NotFoundError, type RoleProbe, type TenancyProbe } from './allow';

/**
 * Who the bills go to (Stage 5). The engine's checkCustomer runs before
 * every write; staff may add and change a customer, only the owner archives
 * one (nothing is deleted: an archived customer keeps their bills).
 */
export type Customer = typeof schema.customers.$inferSelect;

export class CustomerError extends Error {
  constructor(
    public readonly field: CustomerField | 'phone-taken',
    public readonly say: Say,
  ) {
    super(`customer ${field}: ${say.key}`);
    this.name = 'CustomerError';
  }
}

export const allowedRoles = {
  createCustomer: ['owner', 'staff'],
  updateCustomer: ['owner', 'staff'],
  archiveCustomer: ['owner'],
} as const satisfies Record<string, readonly Role[]>;

function checked(input: CustomerInput) {
  const c = checkCustomer(input);
  if (!c.ok) throw new CustomerError(c.field, c.message);
  return c.customer;
}

/** A unique phone already belongs to another customer of the business: say who. */
function phoneTaken(e: unknown): boolean {
  const err = e as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const c = err.cause ?? err;
  return c.code === '23505' && c.constraint === 'customers_business_phone';
}

export async function listCustomers(
  scope: TenantScope,
  filter: { includeArchived?: boolean; q?: string } = {},
): Promise<Customer[]> {
  return withTenant(scope, async ({ db }) => {
    const q = filter.q?.trim();
    return db
      .select()
      .from(schema.customers)
      .where(
        and(
          eq(schema.customers.businessId, scope.businessId),
          ...(filter.includeArchived ? [] : [eq(schema.customers.archived, false)]),
          ...(q
            ? [
                sql`(${schema.customers.name} ilike ${`%${q}%`} or ${schema.customers.phone} like ${`%${q.replace(/\D/g, '') || q}%`} or ${schema.customers.gstin} ilike ${`%${q}%`})`,
              ]
            : []),
        ),
      )
      .orderBy(sql`${schema.customers.lastBilledAt} desc nulls last`, asc(schema.customers.name));
  });
}

export async function getCustomer(scope: TenantScope, id: string): Promise<Customer> {
  return withTenant(scope, async ({ db }) => {
    const row = (await db.select().from(schema.customers).where(eq(schema.customers.id, id)))[0];
    if (!row) throw new NotFoundError('customer');
    return row;
  });
}

/** The business's customers as the import matcher reads them (archived ones included: they still exist). */
export async function existingForMatch(scope: TenantScope): Promise<ExistingCustomer[]> {
  return withTenant(scope, async ({ db }) =>
    db
      .select({
        id: schema.customers.id,
        name: schema.customers.name,
        gstin: schema.customers.gstin,
        phone: schema.customers.phone,
      })
      .from(schema.customers),
  );
}

export async function createCustomer(scope: TenantScope, input: CustomerInput): Promise<Customer> {
  allow(scope, allowedRoles.createCustomer, 'add a customer');
  const c = checked(input);
  try {
    return await withTenant(scope, async ({ db }) => {
      const [row] = await db
        .insert(schema.customers)
        .values({ ...c, businessId: scope.businessId, createdBy: scope.userId })
        .returning();
      return row!;
    });
  } catch (e) {
    if (phoneTaken(e)) throw new CustomerError('phone-taken', { key: 'error.phoneTaken' });
    throw e;
  }
}

/**
 * A field the input leaves out (undefined) keeps its stored value; null clears it. The customer screen edits the
 * name, phone, GSTIN and language: an address, State or PAN brought in by an import stays.
 */
export async function updateCustomer(scope: TenantScope, id: string, input: CustomerInput): Promise<Customer> {
  allow(scope, allowedRoles.updateCustomer, 'change a customer');
  try {
    return await withTenant(scope, async ({ db }) => {
      const stored = (await db.select().from(schema.customers).where(eq(schema.customers.id, id)).for('update'))[0];
      if (!stored) throw new NotFoundError('customer');
      const base: CustomerInput = {
        name: stored.name,
        contactPerson: stored.contactPerson,
        phone: stored.phone,
        email: stored.email,
        gstin: stored.gstin,
        pan: stored.pan,
        address: stored.address,
        city: stored.city,
        pincode: stored.pincode,
        stateCode: stored.stateCode,
        language: stored.language,
        languageSource: stored.languageSource as CustomerInput['languageSource'],
        notes: stored.notes,
      };
      const c = checked({ ...base, ...definedOnly(input) });
      const [row] = await db
        .update(schema.customers)
        .set({ ...c, updatedAt: sql`now()` })
        .where(eq(schema.customers.id, id))
        .returning();
      if (!row) throw new NotFoundError('customer');
      return row;
    });
  } catch (e) {
    if (phoneTaken(e)) throw new CustomerError('phone-taken', { key: 'error.phoneTaken' });
    throw e;
  }
}

export async function archiveCustomer(scope: TenantScope, id: string, archived = true): Promise<Customer> {
  allow(scope, allowedRoles.archiveCustomer, 'remove a customer');
  return withTenant(scope, async ({ db }) => {
    const [row] = await db
      .update(schema.customers)
      .set({ archived, updatedAt: sql`now()` })
      .where(eq(schema.customers.id, id))
      .returning();
    if (!row) throw new NotFoundError('customer');
    return row;
  });
}

// --- probes for the generated tests (not part of the product API)
const probe = (): CustomerInput => ({ name: `Probe Customer ${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });
export const roleProbes: Record<keyof typeof allowedRoles, RoleProbe> = {
  createCustomer: (scope) => createCustomer(scope, probe()),
  updateCustomer: async (scope) => {
    const c = await createCustomer(scope, probe());
    return updateCustomer(scope, c.id, { name: `${c.name} (changed)` });
  },
  archiveCustomer: async (scope) => {
    // The owner's own row to archive: created as staff would (the create is allowed for both).
    const c = await createCustomer({ ...scope, role: 'owner' }, probe());
    return archiveCustomer(scope, c.id);
  },
};
const otherScope = (scope: TenantScope, other: { businessId: string; userId: string }): TenantScope => ({
  ...scope,
  businessId: other.businessId,
  userId: other.userId,
  role: 'staff',
});
export const tenancyProbes: TenancyProbe[] = [
  {
    name: 'listCustomers lists only its own customers',
    run: async (scope, other) => {
      await createCustomer(otherScope(scope, other), probe());
      return {
        touched: [...new Set((await listCustomers(scope, { includeArchived: true })).map((c) => c.businessId))],
      };
    },
  },
  {
    name: "updateCustomer cannot reach another business's customer",
    run: async (scope, other) => {
      const theirs = await createCustomer(otherScope(scope, other), probe());
      try {
        await updateCustomer(scope, theirs.id, { name: 'Taken over' });
        return { touched: [other.businessId] };
      } catch (e) {
        if (e instanceof NotFoundError) return { touched: [scope.businessId] };
        throw e;
      }
    },
  },
  {
    name: 'existingForMatch sees only its own customers',
    run: async (scope, other) => {
      const theirs = await createCustomer(otherScope(scope, other), probe());
      const mine = await existingForMatch(scope);
      return { touched: mine.some((c) => c.id === theirs.id) ? [other.businessId] : [scope.businessId] };
    },
  },
];

/** The keys a caller gave (undefined dropped): what a patch overlays on the stored row. */
function definedOnly<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as Partial<T>;
}
