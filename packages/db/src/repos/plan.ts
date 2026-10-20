import { randomInt } from 'node:crypto';

import { and, asc, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';

import {
  PLAN,
  REFERRAL_ALPHABET,
  nextPeriod,
  planState,
  priceOf,
  referralCodeOf,
  utrOf,
  type PlanPeriod,
  type PlanState,
} from '@ekbill/engine';

import * as schema from '../schema';
import { withTenant, type Role, type TenantScope, type Tx } from '../scope';
import { allow, type RoleProbe, type TenancyProbe } from './allow';

/**
 * EkBill's own fee and refer-a-friend (20 Oct). The rule is the engine's (packages/engine/src/plan.ts); here the
 * counts and rows it reads, the owner's UPI payment (claimed at once, confirmed or rejected by the operator,
 * packages/db/src/plan-admin.ts), and the business's referral code. A referral join is the referrer's row: a
 * friend's sign-up and first bill write it under the referrer's tenancy, in the friend's own transaction.
 */
export class PlanError extends Error {
  constructor(readonly key: 'plan.utr.invalid' | 'plan.utr.used' | 'plan.required') {
    super(key);
    this.name = 'PlanError';
  }
}

export const allowedRoles = {
  claimPayment: ['owner'],
  referralCode: ['owner', 'staff'],
} as const satisfies Record<string, readonly Role[]>;

export interface PlanView {
  state: PlanState;
  billsIssued: number;
  freeBills: number;
  payments: Array<PlanPeriod & { id: string; amountPaise: number; discountPaise: number; utr: string }>;
  next: { periodStart: string; periodEnd: string; amountPaise: number; discountPaise: number };
  referrals: { joined: number; earned: number; creditsLeft: number };
}

/** Bills issued so far: credit notes, drafts and cancelled bills left out. */
async function billsIssued(tx: Tx): Promise<number> {
  const [row] = await tx.db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.documents)
    .where(and(eq(schema.documents.status, 'issued'), ne(schema.documents.kind, 'credit_note')));
  return row?.n ?? 0;
}

async function factsIn(tx: Tx, today: string) {
  const [biz] = await tx.db
    .select({ compUntil: schema.businesses.planCompUntil })
    .from(schema.businesses)
    .where(eq(schema.businesses.id, tx.scope.businessId));
  const payments = await tx.db
    .select({
      id: schema.planPayments.id,
      periodStart: schema.planPayments.periodStart,
      periodEnd: schema.planPayments.periodEnd,
      status: schema.planPayments.status,
      amountPaise: schema.planPayments.amountPaise,
      discountPaise: schema.planPayments.discountPaise,
      utr: schema.planPayments.utr,
    })
    .from(schema.planPayments)
    .orderBy(asc(schema.planPayments.periodStart));
  const joins = await tx.db
    .select({ earnedAt: schema.referralJoins.earnedAt, used: schema.referralJoins.usedPaymentId })
    .from(schema.referralJoins);
  const creditsLeft = joins.filter((j) => j.earnedAt && !j.used).length;
  return {
    facts: {
      billsIssued: await billsIssued(tx),
      compUntil: biz?.compUntil ?? null,
      payments: payments as Array<PlanView['payments'][number]>,
      creditsLeft,
      today,
    },
    joins,
  };
}

/** Where the business stands: the state, its payments, what the next month costs, its referrals. Any member reads. */
export async function planOf(scope: TenantScope, today: string): Promise<PlanView> {
  return withTenant(scope, async (tx) => {
    const { facts, joins } = await factsIn(tx, today);
    return {
      state: planState(facts),
      billsIssued: facts.billsIssued,
      freeBills: PLAN.freeBills,
      payments: facts.payments,
      next: { ...nextPeriod(facts.payments, today), ...priceOf(facts.creditsLeft) },
      referrals: {
        joined: joins.length,
        earned: joins.filter((j) => j.earnedAt).length,
        creditsLeft: facts.creditsLeft,
      },
    };
  });
}

/**
 * Inside issueDocument's transaction: refuse a bill the plan does not allow (only when the operator has payments
 * set up), and count a referred business's first bill for the friend who referred it.
 */
export async function guardIssue(tx: Tx, opts: { today: string; enforce: boolean }): Promise<void> {
  if (opts.enforce) {
    const { facts } = await factsIn(tx, opts.today);
    if (!planState(facts).canIssue) throw new PlanError('plan.required');
  }
}
export async function countReferral(tx: Tx): Promise<void> {
  const [biz] = await tx.db
    .select({ referredBy: schema.businesses.referredBy })
    .from(schema.businesses)
    .where(eq(schema.businesses.id, tx.scope.businessId));
  if (!biz?.referredBy) return;
  const own = tx.scope.businessId;
  await tx.client.query(
    "select set_config('app.business_id', $1, true), set_config('app.actor_kind', 'system', true)",
    [biz.referredBy],
  );
  try {
    await tx.db
      .update(schema.referralJoins)
      .set({ earnedAt: sql`now()` })
      .where(and(eq(schema.referralJoins.friendBusinessId, own), isNull(schema.referralJoins.earnedAt)));
  } finally {
    await tx.client.query("select set_config('app.business_id', $1, true), set_config('app.actor_kind', $2, true)", [
      own,
      tx.scope.actorKind ?? 'user',
    ]);
  }
}

/**
 * The owner paid EkBill by UPI and gives the reference: the next month starts at once, at the price the plan
 * screen showed (one waiting referral used up). A reference already given, by anyone, is refused.
 */
export async function claimPayment(
  scope: TenantScope,
  input: { utr: string; today: string },
): Promise<PlanView['payments'][number]> {
  allow(scope, allowedRoles.claimPayment, 'pay for the plan');
  const utr = utrOf(input.utr);
  if (!utr) throw new PlanError('plan.utr.invalid');
  return withTenant(scope, async (tx) => {
    const { facts } = await factsIn(tx, input.today);
    const period = nextPeriod(facts.payments, input.today);
    const credit = (
      await tx.db
        .select({ id: schema.referralJoins.id })
        .from(schema.referralJoins)
        .where(and(isNotNull(schema.referralJoins.earnedAt), isNull(schema.referralJoins.usedPaymentId)))
        .orderBy(asc(schema.referralJoins.earnedAt))
        .limit(1)
        .for('update')
    )[0];
    const price = priceOf(credit ? 1 : 0);
    // Another business's reference is invisible here (row security); the unique index still refuses it.
    const taken = await tx.client.query('select 1 from plan_payments where utr = $1', [utr]);
    if (taken.rowCount) throw new PlanError('plan.utr.used');
    let row;
    try {
      [row] = await tx.db
        .insert(schema.planPayments)
        .values({ businessId: scope.businessId, ...period, ...price, utr, createdBy: scope.userId })
        .returning();
    } catch (e) {
      // Drizzle wraps the driver's error: the unique index's refusal is in the cause.
      const code = (e as { code?: string; cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;
      if (code === '23505') throw new PlanError('plan.utr.used');
      throw e;
    }
    if (credit) {
      await tx.db
        .update(schema.referralJoins)
        .set({ usedPaymentId: row!.id })
        .where(eq(schema.referralJoins.id, credit.id));
    }
    return {
      id: row!.id,
      periodStart: row!.periodStart,
      periodEnd: row!.periodEnd,
      status: row!.status as PlanPeriod['status'],
      amountPaise: row!.amountPaise,
      discountPaise: row!.discountPaise,
      utr: row!.utr,
    };
  });
}

function newCode(): string {
  return Array.from({ length: 6 }, () => REFERRAL_ALPHABET[randomInt(REFERRAL_ALPHABET.length)]).join('');
}

/** The business's referral code, made the first time it is asked for. */
export async function referralCode(scope: TenantScope): Promise<string> {
  allow(scope, allowedRoles.referralCode, 'share the referral link');
  return withTenant(scope, async (tx) => {
    const found = await tx.db
      .select({ code: schema.referralCodes.code })
      .from(schema.referralCodes)
      .where(eq(schema.referralCodes.businessId, scope.businessId));
    if (found[0]) return found[0].code;
    for (let i = 0; i < 8; i++) {
      const code = newCode();
      const made = await tx.db
        .insert(schema.referralCodes)
        .values({ code, businessId: scope.businessId })
        .onConflictDoNothing()
        .returning({ code: schema.referralCodes.code });
      if (made[0]) return made[0].code;
      // A conflict on the business itself (two taps at once): the other insert's code is the code.
      const again = await tx.db
        .select({ code: schema.referralCodes.code })
        .from(schema.referralCodes)
        .where(eq(schema.referralCodes.businessId, scope.businessId));
      if (again[0]) return again[0].code;
    }
    throw new Error('referral code: no free code after 8 tries');
  });
}

/**
 * Inside createBusiness's transaction (app.business_id is the new business): a sign-up that came by a referral
 * link records who referred it, and the referrer's join row (under the referrer's tenancy). An unknown code, or the
 * business's own, is ignored: a link never stops a sign-up.
 */
export async function joinByReferral(
  client: { query: (q: string, v?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  newBusinessId: string,
  rawCode: unknown,
): Promise<string | null> {
  const code = referralCodeOf(rawCode);
  if (!code) return null;
  const { rows } = await client.query('select business_id from referral_codes where code = $1', [code]);
  const referrer = rows[0]?.business_id as string | undefined;
  if (!referrer || referrer === newBusinessId) return null;
  await client.query('update businesses set referred_by = $1 where id = $2', [referrer, newBusinessId]);
  await client.query("select set_config('app.business_id', $1, true)", [referrer]);
  try {
    await client.query(
      'insert into referral_joins (business_id, friend_business_id) values ($1, $2) on conflict do nothing',
      [referrer, newBusinessId],
    );
  } finally {
    await client.query("select set_config('app.business_id', $1, true)", [newBusinessId]);
  }
  return referrer;
}

// --- probes for the generated tests (not part of the product API)
let probeUtr = 0;
const utrForProbe = () => `9${String(Date.now()).slice(-8)}${String(++probeUtr % 1000).padStart(3, '0')}`;

export const roleProbes: Record<keyof typeof allowedRoles, RoleProbe> = {
  claimPayment: (scope) => claimPayment(scope, { utr: utrForProbe(), today: '2026-10-20' }),
  referralCode: (scope) => referralCode(scope),
};
export const tenancyProbes: TenancyProbe[] = [
  {
    name: 'planOf counts only the business’s own payments and referrals',
    run: async (scope, other) => {
      await claimPayment(
        { ...scope, businessId: other.businessId, userId: other.userId, role: 'owner' },
        {
          utr: utrForProbe(),
          today: '2026-10-20',
        },
      );
      const mine = await withTenant(scope, (tx) =>
        tx.db.select({ b: schema.planPayments.businessId }).from(schema.planPayments),
      );
      return { touched: [...new Set(mine.map((r) => r.b))] };
    },
  },
  {
    name: 'referralCode returns the business’s own code, never another’s',
    run: async (scope, other) => {
      const theirs = await referralCode({
        ...scope,
        businessId: other.businessId,
        userId: other.userId,
        role: 'owner',
      });
      const mine = await referralCode(scope);
      return { touched: theirs === mine ? [other.businessId] : [scope.businessId] };
    },
  },
];
