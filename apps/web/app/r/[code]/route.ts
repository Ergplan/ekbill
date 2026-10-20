import { NextResponse } from 'next/server';

import { referralCodeOf } from '@ekbill/engine';

import { logRequest, requestId } from '../../../server/log';
import { REFERRAL_COOKIE } from '../../../server/referral';

export const dynamic = 'force-dynamic';

/**
 * A friend's link (20 Oct): /r/<code>. The code is kept in a cookie for 30 days and used when this phone's owner
 * sets up their business (finishSetup); then the welcome screen. A code that is not one is dropped, never an error.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const id = requestId(request);
  const code = referralCodeOf((await params).code);
  const res = new NextResponse(null, { status: 303, headers: { Location: '/welcome', 'x-request-id': id } });
  if (code) res.cookies.set(REFERRAL_COOKIE, code, { path: '/', maxAge: 30 * 86_400, sameSite: 'lax', httpOnly: true });
  logRequest('GET /r/[code]', id, { valid: Boolean(code) });
  return res;
}
