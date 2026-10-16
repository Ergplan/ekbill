import { and, asc, eq, sql } from 'drizzle-orm';

import { canSetNextNumber, validateSeries, type SeriesConfig, type SeriesProblem } from '@ekbill/engine';

import * as schema from '../schema';
import { withTenant, type Role, type TenantScope } from '../scope';
import { allow, NotFoundError, type RoleProbe, type TenancyProbe } from './allow';

/**
 * Numbering series (I3). The arithmetic is the engine's numbering.ts; this
 * module keeps the rows. The allocation itself happens in documents.ts
 * (issueDocument locks the series row); here the owner adds, renames,
 * retires a series and moves its next number up, never down.
 */
export type SeriesKind = 'bill' | 'credit_note';

export interface Series {
  id: string;
  businessId: string;
  name: string;
  kind: SeriesKind;
  prefix: string;
  padding: number;
  includeFy: boolean;
  nextNumber: number;
  fy: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class SeriesError extends Error {
  constructor(
    public readonly problem: SeriesProblem | 'next-number-down' | 'name',
    message: string,
  ) {
    super(message);
    this.name = 'SeriesError';
  }
}

/** Only the owner shapes the numbering (Aap → bill number series). */
export const allowedRoles = {
  create: ['owner'],
  update: ['owner'],
} as const satisfies Record<string, readonly Role[]>;

export function configOf(row: Pick<Series, 'prefix' | 'padding' | 'includeFy' | 'nextNumber' | 'fy'>): SeriesConfig {
  return {
    prefix: row.prefix,
    padding: row.padding,
    includeFinancialYear: row.includeFy,
    nextNumber: row.nextNumber,
    financialYear: row.fy,
  };
}

const asSeries = (row: typeof schema.series.$inferSelect): Series => row as Series;

export async function listSeries(scope: TenantScope, filter: { kind?: SeriesKind } = {}): Promise<Series[]> {
  return withTenant(scope, async ({ db }) => {
    const rows = await db
      .select()
      .from(schema.series)
      .where(
        and(
          eq(schema.series.businessId, scope.businessId),
          ...(filter.kind ? [eq(schema.series.kind, filter.kind)] : []),
        ),
      )
      .orderBy(asc(schema.series.createdAt), asc(schema.series.id));
    return rows.map(asSeries);
  });
}

export async function getSeries(scope: TenantScope, id: string): Promise<Series> {
  return withTenant(scope, async ({ db }) => {
    const row = (await db.select().from(schema.series).where(eq(schema.series.id, id)))[0];
    if (!row) throw new NotFoundError('series');
    return asSeries(row);
  });
}

/** The series a new document of this kind goes in when none is chosen: the oldest active one. */
export async function defaultSeries(scope: TenantScope, kind: SeriesKind): Promise<Series | null> {
  return withTenant(scope, async ({ db }) => {
    const row = (
      await db
        .select()
        .from(schema.series)
        .where(and(eq(schema.series.kind, kind), eq(schema.series.active, true)))
        .orderBy(asc(schema.series.createdAt), asc(schema.series.id))
        .limit(1)
    )[0];
    return row ? asSeries(row) : null;
  });
}

export interface SeriesInput {
  name: string;
  kind: SeriesKind;
  prefix: string;
  padding: number;
  includeFy: boolean;
  nextNumber?: number;
}

function check(input: Pick<SeriesInput, 'prefix' | 'padding' | 'includeFy'> & { nextNumber: number }): void {
  const problem = validateSeries({
    prefix: input.prefix,
    padding: input.padding,
    includeFinancialYear: input.includeFy,
    nextNumber: input.nextNumber,
  });
  if (problem) throw new SeriesError(problem, `series ${problem}`);
}

export async function createSeries(scope: TenantScope, input: SeriesInput): Promise<Series> {
  allow(scope, allowedRoles.create, 'add a series');
  const name = input.name.trim();
  if (!name) throw new SeriesError('name', 'a series needs a name');
  check({ ...input, nextNumber: input.nextNumber ?? 1 });
  return withTenant(scope, async ({ db }) => {
    const [row] = await db
      .insert(schema.series)
      .values({
        businessId: scope.businessId,
        name,
        kind: input.kind,
        prefix: input.prefix,
        padding: input.padding,
        includeFy: input.includeFy,
        nextNumber: input.nextNumber ?? 1,
      })
      .returning();
    return asSeries(row!);
  });
}

export async function updateSeries(
  scope: TenantScope,
  id: string,
  patch: Partial<Pick<SeriesInput, 'name' | 'prefix' | 'padding' | 'includeFy' | 'nextNumber'>> & { active?: boolean },
): Promise<Series> {
  allow(scope, allowedRoles.update, 'change a series');
  return withTenant(scope, async ({ db }) => {
    const current = (await db.select().from(schema.series).where(eq(schema.series.id, id)).for('update'))[0];
    if (!current) throw new NotFoundError('series');
    const next = {
      name: patch.name?.trim() ?? current.name,
      prefix: patch.prefix ?? current.prefix,
      padding: patch.padding ?? current.padding,
      includeFy: patch.includeFy ?? current.includeFy,
      nextNumber: patch.nextNumber ?? current.nextNumber,
      active: patch.active ?? current.active,
    };
    if (!next.name) throw new SeriesError('name', 'a series needs a name');
    check(next);
    if (patch.nextNumber !== undefined) {
      // Gapless: everything below next_number in the current year has been issued (I3).
      const highestIssued = current.fy ? current.nextNumber - 1 : 0;
      if (!canSetNextNumber(configOf(current), patch.nextNumber, highestIssued))
        throw new SeriesError('next-number-down', `the next number can only go up, past ${highestIssued}`);
    }
    const [row] = await db
      .update(schema.series)
      .set({ ...next, updatedAt: sql`now()` })
      .where(eq(schema.series.id, id))
      .returning();
    return asSeries(row!);
  });
}

// --- probes for the generated tests (not part of the product API)
const probeInput = (suffix: string): SeriesInput => ({
  name: `Probe ${suffix}`,
  kind: 'bill',
  prefix: 'PR-',
  padding: 3,
  includeFy: false,
});
export const roleProbes: Record<keyof typeof allowedRoles, RoleProbe> = {
  create: (scope) => createSeries(scope, probeInput(`${Date.now()}`)),
  update: async (scope) => {
    const s = await createSeries(scope, probeInput(`u${Date.now()}`));
    return updateSeries(scope, s.id, { name: `${s.name} renamed`, nextNumber: 5 });
  },
};
export const tenancyProbes: TenancyProbe[] = [
  {
    name: 'listSeries lists only its own series',
    run: async (scope) => ({ touched: [...new Set((await listSeries(scope)).map((s) => s.businessId))] }),
  },
  {
    name: "updateSeries cannot reach another business's series",
    run: async (scope, other) => {
      const theirs = await listSeries({ ...scope, businessId: other.businessId, userId: other.userId, role: 'owner' });
      try {
        await updateSeries(scope, theirs[0]!.id, { name: 'Taken over' });
        return { touched: [other.businessId] };
      } catch (e) {
        if (e instanceof NotFoundError) return { touched: [scope.businessId] };
        throw e;
      }
    },
  },
];
