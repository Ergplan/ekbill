import { NextResponse } from 'next/server';

import { resolveScope } from '@ekbill/db';

import { authMode } from '../../../../server/auth-mode';
import { firebaseVerifier } from '../../../../server/firebase-admin';
import { logRequest, requestId } from '../../../../server/log';
import { OtpError, signInWithIdToken } from '../../../../server/otp';
import { sessionCookie } from '../../../../server/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Phone OTP sign-in (Stage 10): the ID token Firebase gave the browser after the SMS code, once.
 * Verified here, then EkBill's own session cookie (and the person's theme and language). Only
 * with AUTH_MODE=otp; in the build's switcher mode the door is closed (404). Rate-limited with
 * the other sign-in doors (proxy.ts, 30 a minute per address).
 */
export async function POST(request: Request) {
  const id = requestId(request);
  if (authMode() !== 'otp')
    return NextResponse.json({ error: 'otp.off' }, { status: 404, headers: { 'x-request-id': id } });
  const body = (await request.json().catch(() => ({}))) as { idToken?: unknown };
  try {
    const r = await signInWithIdToken(String(body.idToken ?? ''), firebaseVerifier(), {
      userAgent: request.headers.get('user-agent'),
    });
    const me = await resolveScope(r.sessionId, id);
    const res = NextResponse.json({ to: r.to }, { headers: { 'x-request-id': id } });
    res.cookies.set(sessionCookie(r.sessionId, r.expiresAt));
    res.cookies.set('eb-theme', me?.user.theme ?? 'narangi', { path: '/', maxAge: 31_536_000, sameSite: 'lax' });
    res.cookies.set('eb-lang', me?.user.language ?? 'hi-Latn', { path: '/', maxAge: 31_536_000, sameSite: 'lax' });
    logRequest('POST /api/auth/otp', id, { signedIn: true, to: r.to });
    return res;
  } catch (e) {
    if (!(e instanceof OtpError)) throw e;
    logRequest('POST /api/auth/otp', id, { signedIn: false, error: e.code });
    return NextResponse.json({ error: e.code }, { status: 401, headers: { 'x-request-id': id } });
  }
}
