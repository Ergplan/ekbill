import { and, asc, eq, sql } from 'drizzle-orm';

import { checkItem, type ItemField, type ItemInput, type Say } from '@ekbill/engine';

import * as schema from '../schema';
import { withTenant, type Role, type TenantScope } from '../scope';
import { allow, NotFoundError, type RoleProbe, type TenancyProbe } from './allow';

/**
 * What is usually on the bills (Stage 5): name (unique per business, case
 * aside), HSN/SAC, unit, rate, GST rate. Staff add and change items; only
 * the owner archives one.
 */
export type Item = typeof schema.items.$inferSelect;

export class ItemError extends Error {
  constructor(
    public readonly field: ItemField | 'name-taken',
    public readonly say: Say,
  ) {
    super(`item ${field}: ${say.key}`);
    this.name = 'ItemError';
  }
}

export const allowedRoles = {
  createItem: ['owner', 'staff'],
  updateItem: ['owner', 'staff'],
  archiveItem: ['owner'],
} as const satisfies Record<string, readonly Role[]>;

function checked(input: ItemInput, today: string) {
  const c = checkItem(input, today);
  if (!c.ok) throw new ItemError(c.field, c.message);
  return c.item;
}
function nameTaken(e: unknown): boolean {
  const err = e as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const c = err.cause ?? err;
  return c.code === '23505' && c.constraint === 'items_business_name';
}

export async function listItems(
  scope: TenantScope,
  filter: { includeArchived?: boolean; q?: string } = {},
): Promise<Item[]> {
  return withTenant(scope, async ({ db }) => {
    const q = filter.q?.trim();
    return db
      .select()
      .from(schema.items)
      .where(
        and(
          eq(schema.items.businessId, scope.businessId),
          ...(filter.includeArchived ? [] : [eq(schema.items.archived, false)]),
          ...(q ? [sql`(${schema.items.name} ilike ${`%${q}%`} or ${schema.items.hsnSac} like ${`${q}%`})`] : []),
        ),
      )
      .orderBy(asc(schema.items.name));
  });
}

export async function getItem(scope: TenantScope, id: string): Promise<Item> {
  return withTenant(scope, async ({ db }) => {
    const row = (await db.select().from(schema.items).where(eq(schema.items.id, id)))[0];
    if (!row) throw new NotFoundError('item');
    return row;
  });
}

export async function createItem(scope: TenantScope, input: ItemInput, today: string): Promise<Item> {
  allow(scope, allowedRoles.createItem, 'add an item');
  const c = checked(input, today);
  try {
    return await withTenant(scope, async ({ db }) => {
      const [row] = await db
        .insert(schema.items)
        .values({ ...c, businessId: scope.businessId, createdBy: scope.userId })
        .returning();
      return row!;
    });
  } catch (e) {
    if (nameTaken(e)) throw new ItemError('name-taken', { key: 'error.itemTaken' });
    throw e;
  }
}

export async function updateItem(scope: TenantScope, id: string, input: ItemInput, today: string): Promise<Item> {
  allow(scope, allowedRoles.updateItem, 'change an item');
  try {
    return await withTenant(scope, async ({ db }) => {
      // A patch: what the item screen does not show (the description, "price includes GST") stays as stored.
      const stored = (await db.select().from(schema.items).where(eq(schema.items.id, id)).for('update'))[0];
      if (!stored) throw new NotFoundError('item');
      const base: ItemInput = {
        name: stored.name,
        description: stored.description,
        hsnSac: stored.hsnSac,
        unit: stored.unit,
        defaultRatePaise: stored.defaultRatePaise,
        defaultTaxBp: stored.defaultTaxBp,
        priceIncludesTax: stored.priceIncludesTax,
      };
      const given = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as Partial<ItemInput>;
      const c = checked({ ...base, ...given }, today);
      const [row] = await db
        .update(schema.items)
        .set({ ...c, updatedAt: sql`now()` })
        .where(eq(schema.items.id, id))
        .returning();
      if (!row) throw new NotFoundError('item');
      return row;
    });
  } catch (e) {
    if (nameTaken(e)) throw new ItemError('name-taken', { key: 'error.itemTaken' });
    throw e;
  }
}

export async function archiveItem(scope: TenantScope, id: string, archived = true): Promise<Item> {
  allow(scope, allowedRoles.archiveItem, 'remove an item');
  return withTenant(scope, async ({ db }) => {
    const [row] = await db
      .update(schema.items)
      .set({ archived, updatedAt: sql`now()` })
      .where(eq(schema.items.id, id))
      .returning();
    if (!row) throw new NotFoundError('item');
    return row;
  });
}

// --- probes for the generated tests (not part of the product API)
const TODAY = '2026-10-15';
const probe = (): ItemInput => ({
  name: `Probe item ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  hsnSac: '998719',
  unit: 'visit',
  defaultRatePaise: 50000,
  defaultTaxBp: 1800,
});
export const roleProbes: Record<keyof typeof allowedRoles, RoleProbe> = {
  createItem: (scope) => createItem(scope, probe(), TODAY),
  updateItem: async (scope) => {
    const i = await createItem(scope, probe(), TODAY);
    return updateItem(scope, i.id, { ...probe(), name: `${i.name} (changed)` }, TODAY);
  },
  archiveItem: async (scope) => {
    const i = await createItem({ ...scope, role: 'owner' }, probe(), TODAY);
    return archiveItem(scope, i.id);
  },
};
export const tenancyProbes: TenancyProbe[] = [
  {
    name: 'listItems lists only its own items',
    run: async (scope, other) => {
      await createItem({ ...scope, businessId: other.businessId, userId: other.userId, role: 'staff' }, probe(), TODAY);
      return { touched: [...new Set((await listItems(scope, { includeArchived: true })).map((i) => i.businessId))] };
    },
  },
  {
    name: "getItem cannot read another business's item",
    run: async (scope, other) => {
      const theirs = await createItem(
        { ...scope, businessId: other.businessId, userId: other.userId, role: 'staff' },
        probe(),
        TODAY,
      );
      try {
        await getItem(scope, theirs.id);
        return { touched: [other.businessId] };
      } catch (e) {
        if (e instanceof NotFoundError) return { touched: [scope.businessId] };
        throw e;
      }
    },
  },
];
