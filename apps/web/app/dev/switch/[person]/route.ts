import { NextResponse } from 'next/server';

import { createSession, membershipsOf, resolveScope, seedUser } from '@ekbill/db';

import { authMode } from '../../../../server/auth-mode';
import { logRequest, requestId } from '../../../../server/log';
import { sessionCookie } from '../../../../server/session';

export const dynamic = 'force-dynamic';

/**
 * Become a seeded person (AUTH_MODE=switcher, the build only): a real
 * session row for that user, bound to their one active membership (none for
 * the owner who has no business yet), the session cookie, the person's own
 * theme and language in the cookies the layout reads before paint, then
 * `?to=` (an internal path) or Home, or the welcome screen. Unknown person:
 * back to the list. Stage 10 removes the route behind AUTH_MODE=otp.
 */
export function internalPath(raw: string | null): string | null {
  if (!raw || !/^\/[A-Za-z0-9][A-Za-z0-9/_\-.?=&]*$/.test(raw)) return null;
  try {
    const u = new URL(raw, 'http://ekbill.internal');
    if (u.origin !== 'http://ekbill.internal' || u.pathname !== raw.split('?')[0]) return null;
    return `${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ person: string }> }) {
  const id = requestId(request);
  if (authMode() !== 'switcher') return new NextResponse(null, { status: 404, headers: { 'x-request-id': id } });
  const { person } = await params;
  const found = seedUser(person);
  // A relative Location keeps the host the browser used (127.0.0.1 or localhost), so the cookie travels with it.
  if (!found) {
    logRequest('GET /dev/switch/[person]', id, { person, found: false });
    return new NextResponse(null, { status: 303, headers: { Location: '/dev/switch', 'x-request-id': id } });
  }
  const memberships = await membershipsOf(found.id);
  const business = memberships[0] ?? null;
  const session = await createSession({
    userId: found.id,
    businessId: business?.businessId ?? null,
    userAgent: request.headers.get('user-agent'),
  });
  // The person's settings as they are now (the users row), not as the seed first wrote them.
  const me = await resolveScope(session.id, id);
  const to = internalPath(new URL(request.url).searchParams.get('to')) ?? (business ? '/' : '/welcome');
  const res = new NextResponse(null, { status: 303, headers: { Location: to, 'x-request-id': id } });
  res.cookies.set(sessionCookie(session.id, session.expiresAt));
  res.cookies.set('eb-theme', me?.user.theme ?? found.theme, { path: '/', maxAge: 31_536_000, sameSite: 'lax' });
  res.cookies.set('eb-lang', me?.user.language ?? found.language, { path: '/', maxAge: 31_536_000, sameSite: 'lax' });
  // The Stage 1 persona cookie is gone: the session is the identity now.
  res.cookies.set('eb-as', '', { path: '/', maxAge: 0 });
  logRequest('GET /dev/switch/[person]', id, { person: found.key, business: business?.businessId ?? null, to });
  return res;
}
