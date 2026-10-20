'use server';

import { revalidatePath } from 'next/cache';

import { ForbiddenError, plan } from '@ekbill/db';
import { todayIst } from '@ekbill/engine';

import { log } from '../server/log';
import { current } from '../server/session';
import type { ActionResult } from './user';

/**
 * The owner paid EkBill by UPI (20 Oct) and types the 12-digit reference their UPI app shows: the next month starts
 * at once; the operator confirms it against the bank (deploy/vm/payments.sh). Owner only.
 */
export async function claimPlanPayment(
  input: unknown,
): Promise<ActionResult<{ periodEnd: string; amountPaise: number }>> {
  const utr = input && typeof input === 'object' ? (input as { utr?: unknown }).utr : undefined;
  if (typeof utr !== 'string') return { ok: false, error: 'plan.utr.invalid' };
  const me = await current();
  if (!me) return { ok: false, error: 'auth.signed.out' };
  if (!me.scope) return { ok: false, error: 'auth.no.business' };
  try {
    const paid = await plan.claimPayment(me.scope, { utr, today: todayIst(new Date()) });
    log.info(
      {
        requestId: me.scope.requestId,
        businessId: me.scope.businessId,
        periodEnd: paid.periodEnd,
        amount: paid.amountPaise,
      },
      'plan payment claimed',
    );
    revalidatePath('/aap/plan');
    revalidatePath('/aap');
    return { ok: true, value: { periodEnd: paid.periodEnd, amountPaise: paid.amountPaise } };
  } catch (e) {
    if (e instanceof plan.PlanError) return { ok: false, error: e.key };
    if (e instanceof ForbiddenError) return { ok: false, error: 'auth.forbidden' };
    throw e;
  }
}
