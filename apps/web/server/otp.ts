import 'server-only';

import { acceptInvites, createSession, membershipsOf, userForPhone } from '@ekbill/db';
import { toE164 } from '@ekbill/engine';

/**
 * Phone OTP sign-in (Stage 10; the MVP's Firebase flow, on v2's own
 * sessions). The browser proves the phone with Firebase (the SMS code) and
 * sends the resulting ID token once; here it is verified, the phone is the
 * identity: the person with that number (made on first sign-in), their
 * invitations accepted, a session row for their first business (none for a
 * brand-new owner, who goes to the welcome screen). Firebase's token is
 * never stored. The verifier is passed in, so the tests need no Firebase.
 */
export interface VerifiedToken {
  phone_number?: string;
  auth_time: number;
  uid: string;
}
export type Verifier = (idToken: string) => Promise<VerifiedToken>;

export class OtpError extends Error {
  constructor(readonly code: 'otp.invalid' | 'otp.stale' | 'otp.noPhone') {
    super(code);
  }
}

/** A token older than this is refused: a leaked token is useful for minutes, not hours. */
export const MAX_TOKEN_AGE_MS = 5 * 60 * 1000;

export async function signInWithIdToken(
  idToken: string,
  verify: Verifier,
  opts: { userAgent?: string | null; now?: number } = {},
): Promise<{ sessionId: string; expiresAt: Date; userId: string; to: '/' | '/welcome' }> {
  if (typeof idToken !== 'string' || idToken.length < 20 || idToken.length > 8192) throw new OtpError('otp.invalid');
  let decoded: VerifiedToken;
  try {
    decoded = await verify(idToken);
  } catch {
    throw new OtpError('otp.invalid');
  }
  if ((opts.now ?? Date.now()) - decoded.auth_time * 1000 > MAX_TOKEN_AGE_MS) throw new OtpError('otp.stale');
  const phone = toE164(decoded.phone_number ?? '');
  if (!phone) throw new OtpError('otp.noPhone');
  const user = await userForPhone(phone);
  await acceptInvites(user.id);
  const business = (await membershipsOf(user.id))[0] ?? null;
  const session = await createSession({
    userId: user.id,
    businessId: business?.businessId ?? null,
    userAgent: opts.userAgent ?? null,
  });
  return { sessionId: session.id, expiresAt: session.expiresAt, userId: user.id, to: business ? '/' : '/welcome' };
}
