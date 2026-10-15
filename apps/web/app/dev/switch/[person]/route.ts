import { NextResponse } from 'next/server';

import { logRequest, requestId } from '../../../../lib/log';
import { FIXTURE } from '../../../../screens/fixtures';

export const dynamic = 'force-dynamic';

/**
 * Become a seeded person (AUTH_MODE=switcher, the build only). Sets the
 * eb-as cookie and lands on `?to=` (an internal path) or on Home, or on the
 * welcome screen for the owner who has no business yet. An unknown person
 * goes back to the list. Stage 2 keeps the route and swaps the cookie for a
 * real session; Stage 10 removes it behind AUTH_MODE=otp.
 */
/**
 * `?to=` must be an in-app path: one leading slash, plain characters only
 * (no scheme, no `//host`, no encoded control characters), and it must
 * resolve to this origin. Anything else lands on Home.
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
  const { person } = await params;
  const found = FIXTURE.people.find((p) => p.id === person);
  // A relative Location keeps the host the browser used (127.0.0.1 or localhost), so the cookie travels with it.
  if (!found) {
    logRequest('GET /dev/switch/[person]', id, { person, found: false });
    return new NextResponse(null, { status: 303, headers: { Location: '/dev/switch', 'x-request-id': id } });
  }
  const to = internalPath(new URL(request.url).searchParams.get('to')) ?? (found.business ? '/' : '/welcome');
  const res = new NextResponse(null, { status: 303, headers: { Location: to, 'x-request-id': id } });
  res.cookies.set('eb-as', found.id, { path: '/', maxAge: 60 * 60 * 24 * 30, sameSite: 'lax', httpOnly: true });
  logRequest('GET /dev/switch/[person]', id, { person: found.id, to });
  return res;
}
