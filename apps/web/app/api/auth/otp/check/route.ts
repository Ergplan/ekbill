import { NextResponse } from 'next/server';

import { resolveScope } from '@ekbill/db';

import { authMode } from '../../../../../server/auth-mode';
import { logRequest, requestId } from '../../../../../server/log';
import { OtpError, checkCode } from '../../../../../server/otp';
import { sessionCookie } from '../../../../../server/session';
import { codeSender } from '../../../../../server/verify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STATUS: Record<OtpError['code'], number> = {
  'otp.phone': 400,
  'otp.invalid': 401,
  'otp.stale': 401,
  'otp.tooMany': 429,
  'otp.send.failed': 502,
};

/**
 * Phone sign-in, step 2: `{ phone, code }`. A code Twilio approves makes EkBill's own session cookie (and echoes the
 * person's theme and language); anything else is 401 and signs nobody in. Only with AUTH_MODE=otp.
 */
export async function POST(request: Request) {
  const id = requestId(request);
  if (authMode() !== 'otp')
    return NextResponse.json({ error: 'otp.off' }, { status: 404, headers: { 'x-request-id': id } });
  const sender = codeSender();
  if (!sender) return NextResponse.json({ error: 'otp.unavailable' }, { status: 503, headers: { 'x-request-id': id } });
  // Any JSON at all may arrive: null, a number, an array. Only an object's fields are read.
  const raw: unknown = await request.json().catch(() => null);
  const body = raw && typeof raw === 'object' ? (raw as { phone?: unknown; code?: unknown }) : {};
  try {
    const r = await checkCode(body.phone, body.code, sender, {
      userAgent: request.headers.get('user-agent'),
      requestId: id,
    });
    const me = await resolveScope(r.sessionId, id);
    const res = NextResponse.json({ to: r.to }, { headers: { 'x-request-id': id } });
    res.cookies.set(sessionCookie(r.sessionId, r.expiresAt));
    res.cookies.set('eb-theme', me?.user.theme ?? 'narangi', { path: '/', maxAge: 31_536_000, sameSite: 'lax' });
    res.cookies.set('eb-lang', me?.user.language ?? 'hi-Latn', { path: '/', maxAge: 31_536_000, sameSite: 'lax' });
    logRequest('POST /api/auth/otp/check', id, { signedIn: true, to: r.to });
    return res;
  } catch (e) {
    if (!(e instanceof OtpError)) throw e;
    logRequest('POST /api/auth/otp/check', id, { signedIn: false, error: e.code });
    return NextResponse.json({ error: e.code }, { status: STATUS[e.code], headers: { 'x-request-id': id } });
  }
}
