import { NextResponse } from 'next/server';

import {
  acceptInvites,
  createSession,
  membershipsOf,
  resolveScope,
  seedUser,
  userByPhone,
  userForPhone,
} from '@ekbill/db';
import { toE164 } from '@ekbill/engine';

import { authMode } from '../../../../server/auth-mode';
import { logRequest, requestId } from '../../../../server/log';
import { sessionCookie } from '../../../../server/session';

export const dynamic = 'force-dynamic';

/**
 * Become a seeded person, or a person by phone number (an invited member:
 * the build's stand-in for the OTP sign-in) (AUTH_MODE=switcher, the build only): a real
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
  const seeded = seedUser(person);
  // Signing in from the login screen (?signin=1): a phone EkBill has not seen is a new person, as the OTP
  // sign-in makes one (userForPhone); typed on /dev/switch it is not, and goes back to the list.
  const signingIn = new URL(request.url).searchParams.get('signin') === '1';
  // A phone number: whoever has it, with the invites waiting for it accepted (Stage 9).
  const phone = seeded ? null : toE164(decodeURIComponent(person));
  const byPhone = phone ? await (signingIn ? userForPhone(phone) : userByPhone(phone)) : null;
  const found = seeded
    ? seeded
    : byPhone
      ? {
          id: byPhone.id,
          key: phone!,
          theme: byPhone.theme as 'narangi' | 'harmony' | 'system',
          language: byPhone.language as 'hi-Latn' | 'en',
        }
      : null;
  // A relative Location keeps the host the browser used (127.0.0.1 or localhost), so the cookie travels with it.
  if (!found) {
    logRequest('GET /dev/switch/[person]', id, { person, found: false });
    return new NextResponse(null, { status: 303, headers: { Location: '/dev/switch', 'x-request-id': id } });
  }
  await acceptInvites(found.id, id);
  const memberships = await membershipsOf(found.id);
  const business = memberships[0] ?? null;
  const session = await createSession({
    userId: found.id,
    businessId: business?.businessId ?? null,
    userAgent: request.headers.get('user-agent'),
  });
  // The person's settings as they are now (the users row), not as the seed first wrote them.
  const me = await resolveScope(session.id, id);
  // No business yet: the login screen goes on to setup; the switcher list shows the welcome first.
  const to =
    internalPath(new URL(request.url).searchParams.get('to')) ??
    (business ? '/' : signingIn ? '/setup/name' : '/welcome');
  const res = new NextResponse(null, { status: 303, headers: { Location: to, 'x-request-id': id } });
  res.cookies.set(sessionCookie(session.id, session.expiresAt));
  res.cookies.set('eb-theme', me?.user.theme ?? found.theme, { path: '/', maxAge: 31_536_000, sameSite: 'lax' });
  res.cookies.set('eb-lang', me?.user.language ?? found.language, { path: '/', maxAge: 31_536_000, sameSite: 'lax' });
  // The Stage 1 persona cookie is gone: the session is the identity now.
  res.cookies.set('eb-as', '', { path: '/', maxAge: 0 });
  logRequest('GET /dev/switch/[person]', id, { person: found.key, business: business?.businessId ?? null, to });
  return res;
}
