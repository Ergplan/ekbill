import { NextResponse, type NextRequest } from 'next/server';

/**
 * Every request gets a request id (I7): the caller's x-request-id when it
 * sends a sane one, else a fresh UUID. It travels to the page or route as a
 * request header (lib/log.ts reads it there), comes back on the response,
 * and is logged as one JSON line. Static assets are left out of the matcher.
 */
export function proxy(request: NextRequest) {
  const given = request.headers.get('x-request-id')?.trim();
  const id = given && given.length <= 128 && /^[\w.-]+$/.test(given) ? given : crypto.randomUUID();
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
