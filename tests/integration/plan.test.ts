import { describe, expect, it } from 'vitest';

import { userForPhone } from '../../packages/db/src/auth';
import { decidePayment, grantComp } from '../../packages/db/src/plan-admin';
import * as businesses from '../../packages/db/src/repos/businesses';
import * as documents from '../../packages/db/src/repos/documents';
import * as plan from '../../packages/db/src/repos/plan';
import type { TenantScope } from '../../packages/db/src/scope';
import { getPool } from '../../packages/db/src/pool';
import { seeded } from './helpers';

/**
 * EkBill's own fee and refer-a-friend (20 Oct), on the real tables: 20 bills free, then a paid month (only when the
 * operator takes payments); the owner's UPI reference starts the month at once and is unique everywhere; a friend
 * who joins by the link and issues a first bill makes the referrer's next month ₹15; a rejected payment stops
 * counting and gives the referral back.
 */
seeded();
const TODAY = '2026-10-20';
let n = 0;
const phone = () => `+9188${String(Date.now()).slice(-6)}${String(++n).padStart(2, '0')}`;
const utr = () => `7${String(Date.now()).slice(-8)}${String(++n).padStart(3, '0')}`;

async function newOwner(name: string, referralCode?: string): Promise<TenantScope> {
  const person = await userForPhone(phone());
  const b = await businesses.createBusiness(
    { userId: person.id, requestId: `plan-${name}` },
    { name, gst: 'no', stateCode: '27' },
    { referralCode },
  );
  return { businessId: b.id, userId: person.id, role: 'owner', requestId: `plan-${name}` };
}

async function bill(scope: TenantScope, enforcePlan = false) {
  const draft = await documents.createDraft(scope, {
    customer: { name: 'Walk-in', gstin: null, stateCode: null, address: null, phone: null },
    dateIso: TODAY,
    lines: [
      {
        description: 'Repair',
        quantityMilli: 1000,
        unitPricePaise: 10000,
        gstBp: 0,
        taxRateChosen: true,
        hsnCode: '9987',
      },
    ],
  });
  return documents.issueDocument(scope, { id: draft.id, today: TODAY, enforcePlan });
}

describe('the plan', () => {
  it('20 bills free; the 21st needs a paid month when payments are on; a claimed month lets it through', async () => {
    const owner = await newOwner('Plan Free');
    expect((await plan.planOf(owner, TODAY)).state).toEqual({ kind: 'free', freeLeft: 20, canIssue: true });
    for (let i = 0; i < 20; i++) await bill(owner, true);
    const due = await plan.planOf(owner, TODAY);
    expect(due.state).toEqual({ kind: 'due', lapsedOn: null, canIssue: false });
    expect(due.billsIssued).toBe(20);
    expect(due.next).toEqual({ periodStart: TODAY, periodEnd: '2026-11-19', amountPaise: 2000, discountPaise: 0 });
    await expect(bill(owner, true)).rejects.toEqual(new plan.PlanError('plan.required'));
    // Payments not taken yet (no EKBILL_UPI_ID): nothing is stopped.
    await bill(owner, false);
    const paid = await plan.claimPayment(owner, { utr: utr(), today: TODAY });
    expect(paid).toMatchObject({ periodStart: TODAY, periodEnd: '2026-11-19', amountPaise: 2000, status: 'claimed' });
    expect((await plan.planOf(owner, TODAY)).state).toMatchObject({ kind: 'paid', until: '2026-11-19', claimed: true });
    await bill(owner, true);
  }, 60_000);

  it('a UPI reference is used once, across businesses; staff cannot pay; a malformed one is refused', async () => {
    const a = await newOwner('Plan A');
    const b = await newOwner('Plan B');
    const ref = utr();
    await plan.claimPayment(a, { utr: ref, today: TODAY });
    await expect(plan.claimPayment(b, { utr: ref, today: TODAY })).rejects.toEqual(new plan.PlanError('plan.utr.used'));
    await expect(plan.claimPayment(a, { utr: ref, today: TODAY })).rejects.toEqual(new plan.PlanError('plan.utr.used'));
    await expect(plan.claimPayment(a, { utr: '12345', today: TODAY })).rejects.toEqual(
      new plan.PlanError('plan.utr.invalid'),
    );
    await expect(plan.claimPayment({ ...a, role: 'staff' }, { utr: utr(), today: TODAY })).rejects.toThrow(
      'staff may not pay for the plan',
    );
    // A second month runs on from the first.
    const second = await plan.claimPayment(a, { utr: utr(), today: TODAY });
    expect(second).toMatchObject({ periodStart: '2026-11-20', periodEnd: '2026-12-19' });
  });

  it('refer a friend: joined on sign-up, earned on the friend’s first bill, ₹15 once; a rejection gives it back', async () => {
    const referrer = await newOwner('Plan Referrer');
    const code = await plan.referralCode(referrer);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(await plan.referralCode(referrer)).toBe(code);
    const friend = await newOwner('Plan Friend', code.toLowerCase());
    const joined = await plan.planOf(referrer, TODAY);
    expect(joined.referrals).toEqual({ joined: 1, earned: 0, creditsLeft: 0 });
    expect(joined.next.amountPaise).toBe(2000);
    await bill(friend);
    await bill(friend); // a second bill earns nothing more
    const earned = await plan.planOf(referrer, TODAY);
    expect(earned.referrals).toEqual({ joined: 1, earned: 1, creditsLeft: 1 });
    expect(earned.next).toMatchObject({ amountPaise: 1500, discountPaise: 500 });
    const ref = utr();
    expect(await plan.claimPayment(referrer, { utr: ref, today: TODAY })).toMatchObject({
      amountPaise: 1500,
      discountPaise: 500,
    });
    expect((await plan.planOf(referrer, TODAY)).referrals.creditsLeft).toBe(0);
    // The friend's own plan is untouched by the referral.
    expect((await plan.planOf(friend, TODAY)).next.amountPaise).toBe(2000);
    // The operator finds no such money: the month stops counting and the referral can be used again.
    expect(await decidePayment(ref, 'rejected', 'not in statement')).toBe(true);
    expect(await decidePayment(ref, 'confirmed', null)).toBe(false);
    const after = await plan.planOf(referrer, TODAY);
    expect(after.referrals.creditsLeft).toBe(1);
    expect(after.payments.map((p) => p.status)).toEqual(['rejected']);
  });

  it('an unknown code or the business’s own is ignored; the sign-up goes ahead', async () => {
    const a = await newOwner('Plan Nobody', 'ZZZZZZ');
    const row = await getPool().query('select referred_by from businesses where id = $1', [a.businessId]);
    expect(row.rows[0].referred_by).toBeNull();
    expect((await plan.planOf(a, TODAY)).referrals.joined).toBe(0);
  });

  it('the operator can give a business months without a fee', async () => {
    const owner = await newOwner('Plan Comp');
    for (let i = 0; i < 20; i++) await bill(owner, true);
    const row = await getPool().query('select phone from businesses where id = $1', [owner.businessId]);
    expect(await grantComp(owner.businessId, '2026-12-31')).toBe(1);
    expect((await plan.planOf(owner, TODAY)).state).toEqual({ kind: 'comp', until: '2026-12-31', canIssue: true });
    await bill(owner, true);
    expect(row.rows).toHaveLength(1);
  }, 60_000);
});
