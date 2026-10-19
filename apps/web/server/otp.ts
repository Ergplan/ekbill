import 'server-only';

import { acceptInvites, createSession, membershipsOf, userForPhone } from '@ekbill/db';

import { Limiter, type Limit } from './rate-limit';
import { VerifyError, type CodeSender } from './verify';

/**
 * Phone OTP sign-in (Stage 10; Twilio Verify from 19 Oct). Two steps, both on EkBill's server: `sendCode` asks the
 * sender to SMS a code to an Indian mobile; `checkCode` asks whether the code typed is that code and, when it is,
 * the phone is the identity: the person with that number (made on first sign-in), their invitations accepted, a
 * session for their first business (none for a brand-new owner, who goes to the welcome screen). The sender is
 * passed in, so the tests need no Twilio.
 */
export class OtpError extends Error {
  constructor(readonly code: 'otp.phone' | 'otp.invalid' | 'otp.stale' | 'otp.tooMany' | 'otp.send.failed') {
    super(code);
  }
}

/** An Indian mobile, as +91 and ten digits starting 6–9; anything else is refused before an SMS is paid for. */
export function mobileOf(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 32) return null;
  let digits = raw.replace(/[\s()-]/g, '').replace(/^\+/, '');
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

/**
 * SMS cost money and invite abuse (SMS pumping): besides the 30-a-minute limit per address in proxy.ts, one number
 * gets at most 5 codes an hour, and 10 tries at a code in ten minutes. In this process, as the other limits.
 */
export const PER_PHONE: { send: Limit; check: Limit } = {
  send: { max: 5, windowMs: 60 * 60_000 },
  check: { max: 10, windowMs: 10 * 60_000 },
};
const limiter = new Limiter(20_000);

export async function sendCode(
  rawPhone: unknown,
  sender: CodeSender,
  opts: { now?: number; limits?: typeof PER_PHONE } = {},
): Promise<{ phone: string }> {
  const phone = mobileOf(rawPhone);
  if (!phone) throw new OtpError('otp.phone');
  if (!limiter.hit(`send:${phone}`, (opts.limits ?? PER_PHONE).send, opts.now).ok) throw new OtpError('otp.tooMany');
  try {
    await sender.send(phone);
  } catch (e) {
    if (e instanceof VerifyError && e.code === 'verify.tooMany') throw new OtpError('otp.tooMany');
    throw new OtpError('otp.send.failed');
  }
  return { phone };
}

export async function checkCode(
  rawPhone: unknown,
  rawCode: unknown,
  sender: CodeSender,
  opts: { userAgent?: string | null; now?: number; requestId?: string; limits?: typeof PER_PHONE } = {},
): Promise<{ sessionId: string; expiresAt: Date; userId: string; to: '/' | '/welcome' }> {
  const phone = mobileOf(rawPhone);
  if (!phone) throw new OtpError('otp.phone');
  if (typeof rawCode !== 'string' || !/^\d{4,10}$/.test(rawCode)) throw new OtpError('otp.invalid');
  if (!limiter.hit(`check:${phone}`, (opts.limits ?? PER_PHONE).check, opts.now).ok) throw new OtpError('otp.tooMany');
  let verdict;
  try {
    verdict = await sender.check(phone, rawCode);
  } catch {
    throw new OtpError('otp.send.failed');
  }
  if (verdict === 'expired') throw new OtpError('otp.stale');
  if (verdict !== 'approved') throw new OtpError('otp.invalid');
  return signInWithPhone(phone, opts);
}

/** The session for a phone the code has just proved. */
export async function signInWithPhone(
  phoneE164: string,
  opts: { userAgent?: string | null; requestId?: string } = {},
): Promise<{ sessionId: string; expiresAt: Date; userId: string; to: '/' | '/welcome' }> {
  const user = await userForPhone(phoneE164);
  await acceptInvites(user.id, opts.requestId);
  const business = (await membershipsOf(user.id))[0] ?? null;
  const session = await createSession({
    userId: user.id,
    businessId: business?.businessId ?? null,
    userAgent: opts.userAgent ?? null,
  });
  return { sessionId: session.id, expiresAt: session.expiresAt, userId: user.id, to: business ? '/' : '/welcome' };
}
