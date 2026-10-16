import { and, desc, eq } from 'drizzle-orm';

import * as schema from '../schema';
import { withTenant, type Role, type TenantScope } from '../scope';
import { allow, type RoleProbe, type TenancyProbe } from './allow';

/**
 * One row per model call (rule 9): purpose, model, prompt version, the
 * input's hash (never the input), tokens, cost in micro-USD, latency and
 * the outcome. packages/ai calls the recorder; this writes it under the
 * scope of the person the call was for.
 */
export type AiCall = typeof schema.aiCalls.$inferSelect;

export const allowedRoles = {
  recordAiCall: ['owner', 'staff'],
} as const satisfies Record<string, readonly Role[]>;

export async function recordAiCall(
  scope: TenantScope,
  row: {
    purpose: string;
    model: string;
    promptVersion: string;
    inputHash: string;
    tokensIn: number | null;
    tokensOut: number | null;
    costMicros: number | null;
    latencyMs: number;
    outcome: 'ok' | 'error' | 'timeout' | 'refused';
    error: string | null;
  },
): Promise<string> {
  allow(scope, allowedRoles.recordAiCall, 'record a model call');
  return withTenant(scope, async ({ db }) => {
    const [r] = await db
      .insert(schema.aiCalls)
      .values({ businessId: scope.businessId, userId: scope.userId, ...row, error: row.error?.slice(0, 300) ?? null })
      .returning({ id: schema.aiCalls.id });
    return r!.id;
  });
}

/** The business's model calls, newest first (the cost per read in the stage report comes from here). */
export async function listAiCalls(
  scope: TenantScope,
  filter: { purpose?: string; limit?: number } = {},
): Promise<AiCall[]> {
  return withTenant(scope, async ({ db }) =>
    db
      .select()
      .from(schema.aiCalls)
      .where(
        and(
          eq(schema.aiCalls.businessId, scope.businessId),
          ...(filter.purpose ? [eq(schema.aiCalls.purpose, filter.purpose)] : []),
        ),
      )
      .orderBy(desc(schema.aiCalls.at))
      .limit(filter.limit ?? 100),
  );
}

// --- probes for the generated tests (not part of the product API)
const ROW = {
  purpose: 'probe',
  model: 'probe',
  promptVersion: 'probe/v1',
  inputHash: 'probe',
  tokensIn: 1,
  tokensOut: 1,
  costMicros: 1,
  latencyMs: 1,
  outcome: 'ok' as const,
  error: null,
};
export const roleProbes: Record<keyof typeof allowedRoles, RoleProbe> = {
  recordAiCall: (scope) => recordAiCall(scope, ROW),
};
export const tenancyProbes: TenancyProbe[] = [
  {
    name: "listAiCalls sees nothing of another business's calls",
    run: async (scope, other) => {
      await recordAiCall({ ...scope, businessId: other.businessId, userId: other.userId, role: 'staff' }, ROW);
      const mine = await listAiCalls(scope, { purpose: 'probe' });
      return { touched: [...new Set(mine.map((c) => c.businessId ?? scope.businessId))] };
    },
  },
];
