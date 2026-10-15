import { NextResponse } from 'next/server';

import { FIXTURE } from '../../../../screens/fixtures';

export const dynamic = 'force-dynamic';

/**
 * Become a seeded person (AUTH_MODE=switcher, the build only). Sets the
 * eb-as cookie and lands on Home, or on the welcome screen for the owner
 * who has no business yet. Stage 2 keeps the route and swaps the cookie
 * for a real session; Stage 10 removes it behind AUTH_MODE=otp.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ person: string }> }) {
  const { person } = await params;
  const found = FIXTURE.people.find((p) => p.id === person);
  // A relative Location keeps the host the browser used (127.0.0.1 or localhost), so the cookie travels with it.
  if (!found) return new NextResponse(null, { status: 303, headers: { Location: '/dev/switch' } });
  const to = found.business ? '/' : '/welcome';
  const res = new NextResponse(null, { status: 303, headers: { Location: to } });
  res.cookies.set('eb-as', found.id, { path: '/', maxAge: 60 * 60 * 24 * 30, sameSite: 'lax' });
  return res;
}
