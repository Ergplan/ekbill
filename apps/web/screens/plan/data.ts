import 'server-only';

import { plan } from '@ekbill/db';
import { PLAN, priceOf, todayIst, type PlanState } from '@ekbill/engine';
import { upiQrDataUrl } from '@ekbill/render';

import { upiPayee } from '../../server/plan-config';
import { scopeOf } from '../live';
import type { Viewer } from '../viewer';

/** What the plan screen shows (20 Oct): where the business stands, how to pay EkBill, and the referral link. */
export interface PlanData {
  live: boolean;
  state: PlanState;
  billsIssued: number;
  freeBills: number;
  monthlyPaise: number;
  next: { periodStart: string; periodEnd: string; amountPaise: number; discountPaise: number };
  /** Null until the operator takes payments (EKBILL_UPI_ID). */
  pay: { vpa: string; link: string; qr: string | null; note: string } | null;
  payments: Array<{ id: string; periodStart: string; periodEnd: string; amountPaise: number; status: string }>;
  referral: { code: string; link: string; joined: number; earned: number; creditsLeft: number } | null;
}

/** The UPI deep link every UPI app opens: EkBill's address, the amount, and a note naming the business's code. */
export function upiLink(vpa: string, name: string, amountPaise: number, note: string): string {
  const q = new URLSearchParams({ pa: vpa, pn: name, am: (amountPaise / 100).toFixed(2), cu: 'INR', tn: note });
  return `upi://pay?${q.toString()}`;
}

export async function loadPlan(viewer: Viewer, origin: string): Promise<PlanData> {
  const scope = scopeOf(viewer);
  const payee = upiPayee();
  const today = todayIst(new Date());
  if (!scope) {
    // A look (/flow, the signed-out demo): a business 7 bills in, one friend joined and billing.
    const next = { periodStart: today, periodEnd: today, ...priceOf(1) };
    return {
      live: false,
      state: { kind: 'free', freeLeft: 13, canIssue: true },
      billsIssued: 7,
      freeBills: PLAN.freeBills,
      monthlyPaise: PLAN.monthlyPaise,
      next,
      pay: null,
      payments: [],
      referral: { code: 'SHRM42', link: `${origin}/r/SHRM42`, joined: 2, earned: 1, creditsLeft: 1 },
    };
  }
  const view = await plan.planOf(scope, today);
  const code = scope.role === 'accountant' ? null : await plan.referralCode(scope);
  const note = `EkBill ${code ?? scope.businessId.slice(0, 6)}`;
  const pay =
    payee && scope.role === 'owner'
      ? {
          vpa: payee.vpa,
          note,
          link: upiLink(payee.vpa, payee.name, view.next.amountPaise, note),
          qr: await upiQrDataUrl({
            vpa: payee.vpa,
            payeeName: payee.name,
            amountPaise: view.next.amountPaise,
            reference: note,
          }),
        }
      : null;
  return {
    live: true,
    state: view.state,
    billsIssued: view.billsIssued,
    freeBills: view.freeBills,
    monthlyPaise: PLAN.monthlyPaise,
    next: view.next,
    pay,
    payments: view.payments
      .map((p) => ({
        id: p.id,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        amountPaise: p.amountPaise,
        status: p.status,
      }))
      .reverse(),
    referral: code ? { code, link: `${origin}/r/${code}`, ...view.referrals } : null,
  };
}
