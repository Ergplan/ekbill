import { NextResponse, type NextRequest } from 'next/server';

import { localeOf, t } from '@ekbill/copy/server';

import { Limiter, clientAddress, isRender, isSignIn, isWrite, limitsFromEnv } from './server/rate-limit';

/**
 * Every request gets a request id (I7): the caller's x-request-id when it
 * sends a sane one, else a fresh UUID. It travels to the page or route as a
 * request header (server/log.ts reads it there), comes back on the response,
 * and is logged as one JSON line. Static assets are left out of the matcher.
 *
 * Stage 10's rate limits (master prompt 4.3) are checked here, before any page, action or route
 * runs: 60 writes a minute per session (every POST, server actions included), 30 sign-in
 * attempts a minute per address. Over the limit: 429 with the Hinglish words and Retry-After.
 */
const limiter = new Limiter();
const limits = limitsFromEnv();

function tooMany(
  request: NextRequest,
  id: string,
  key: 'rate.writes' | 'rate.signin',
  retryAfterSeconds: number,
  json: boolean,
) {
  // In the person's language (the cookie the layout reads too).
  const words = t(key, undefined, localeOf(request.cookies.get('eb-lang')?.value));
  const res = json
    ? NextResponse.json({ error: key, message: words }, { status: 429 })
    : new NextResponse(words, { status: 429, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  res.headers.set('retry-after', String(retryAfterSeconds));
  res.headers.set('x-request-id', id);
  return res;
}

export function proxy(request: NextRequest) {
  const given = request.headers.get('x-request-id')?.trim();
  const id = given && given.length <= 128 && /^[\w.-]+$/.test(given) ? given : crypto.randomUUID();
  const path = request.nextUrl.pathname;
  if (isSignIn(path)) {
    const v = limiter.hit(`signin:${clientAddress(request.headers)}`, limits.signIn);
    if (!v.ok) return tooMany(request, id, 'rate.signin', v.retryAfterSeconds, path.startsWith('/api/'));
  } else if (isRender(request.method, path)) {
    const session = request.cookies.get('eb-session')?.value;
    const v = limiter.hit(
      session ? `render:${session}` : `render-ip:${clientAddress(request.headers)}`,
      limits.renders,
    );
    if (!v.ok) return tooMany(request, id, 'rate.writes', v.retryAfterSeconds, true);
  } else if (isWrite(request.method)) {
    const session = request.cookies.get('eb-session')?.value;
    const v = limiter.hit(session ? `write:${session}` : `write-ip:${clientAddress(request.headers)}`, limits.writes);
    if (!v.ok) return tooMany(request, id, 'rate.writes', v.retryAfterSeconds, true);
  }
  const headers = new Headers(request.headers);
  headers.set('x-request-id', id);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set('x-request-id', id);
  console.log(
    JSON.stringify({
      level: 30,
      time: Date.now(),
      name: 'ekbill-web',
      route: request.nextUrl.pathname,
      method: request.method,
      requestId: id,
      msg: 'request',
    }),
  );
  return res;
}

export const config = {
  matcher: ['/((?!_next/|fonts/|thumbs/|fixtures/|favicon\\.ico$|.*\\.(?:png|svg|ico|woff2?)$).*)'],
};
