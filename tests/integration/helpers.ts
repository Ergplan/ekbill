import { beforeAll } from 'vitest';

import { closePool } from '../../packages/db/src/pool';
import type { TenantScope } from '../../packages/db/src/scope';
import { SEED, seedBuild, seedUser, type SeedBusinessKey } from '../../packages/db/src/seed';

/**
 * The integration tests' people: the build seed (three businesses with owner,
 * staff and accountant), upserted once per file. Scopes are built directly
 * from the seed ids — the repositories are what is under test, not the session.
 */
export function seeded(): void {
  beforeAll(async () => {
    await closePool();
    await seedBuild(process.env.DATABASE_URL!, { log: () => undefined });
  });
}

export function businessOf(key: SeedBusinessKey) {
  return SEED.businesses.find((b) => b.key === key)!;
}

export async function scopeFor(business: SeedBusinessKey, role: TenantScope['role']): Promise<TenantScope> {
  const b = businessOf(business);
  const user = seedUser(b[role])!;
  return { businessId: b.id, userId: user.id, role, requestId: `test-${role}-${Date.now()}` };
}

/** Another business's ids, for the tenancy probes. */
export async function otherBusiness(key: SeedBusinessKey): Promise<{ businessId: string; userId: string }> {
  const b = businessOf(key);
  return { businessId: b.id, userId: seedUser(b.staff)!.id };
}
