import 'server-only';

/**
 * EkBill's own fee (20 Oct): where owners pay, from the environment. EKBILL_UPI_ID is the operator's UPI address
 * (it is printed on every owner's plan screen, so it is not a secret). Until it is set, nobody can pay, so nothing
 * is stopped at the 21st bill: the plan screen shows the count and the referral link only.
 */
export function upiPayee(env: Record<string, string | undefined> = process.env): { vpa: string; name: string } | null {
  const vpa = env.EKBILL_UPI_ID?.trim() ?? '';
  if (!/^[\w.-]{2,60}@[a-zA-Z]{2,30}$/.test(vpa)) return null;
  return { vpa, name: env.EKBILL_UPI_NAME?.trim() || 'EkBill' };
}

export function paymentsOn(env: Record<string, string | undefined> = process.env): boolean {
  return upiPayee(env) !== null;
}
