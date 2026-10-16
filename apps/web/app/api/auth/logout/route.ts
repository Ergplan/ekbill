import { NextResponse } from 'next/server';

import { deleteSession, deleteSessionsOf, resolveScope } from '@ekbill/db';

import { logRequest, requestId } from '../../../../server/log';
import { SESSION_COOKIE } from '../../../../server/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Sign out (Stage 11 review: there was no way to): this session ends and its cookie is cleared; with
 * ?everywhere=1, every session of the person ends (a lost or shared shop phone). Always 200: signing out of a
 * session that is already gone is not an error. The button belongs on Aap and waits for the design's approval
 * (KNOWN-GAPS); the door is here.
 */
export async function POST(request: Request) {
  const id = requestId(request);
  const sessionId = /(?:^|;\s*)eb-session=([^;]+)/.exec(request.headers.get('cookie') ?? '')?.[1] ?? null;
  const everywhere = new URL(request.url).searchParams.get('everywhere') === '1';
  let ended = 0;
  if (sessionId) {
    const me = await resolveScope(sessionId, id);
    if (everywhere && me) ended = await deleteSessionsOf(me.user.id);
    else {
      await deleteSession(sessionId);
      ended = 1;
    }
  }
  logRequest('POST /api/auth/logout', id, { ended, everywhere });
  const res = NextResponse.json({ ok: true, ended }, { headers: { 'x-request-id': id } });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    path: '/',
    expires: new Date(0),
    httpOnly: true,
    sameSite: 'lax',
  });
  return res;
}
