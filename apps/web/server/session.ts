import 'server-only';

import { cookies, headers } from 'next/headers';
import { cache } from 'react';

import { resolveScope, type Resolved } from '@ekbill/db';

import { requestId } from './log';

/**
 * The session cookie (httpOnly, lax, 30 days) and what it resolves to for
 * the current request. Pages and actions call current(); it reads the
 * cookie, the request id the proxy stamped, and resolves the scope once.
 */
export const SESSION_COOKIE = 'eb-session';

export async function currentRequestId(): Promise<string> {
  const h = await headers();
  return requestId(new Request('http://ekbill.internal/', { headers: h }));
}

/**
 * The signed-in person and their scope, or null when there is no (valid) session. Resolved once per request
 * (React's cache): a page, its layout and its actions ask the database once, and see the same answer.
 */
export const current = cache(async (): Promise<Resolved | null> => {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (!id) return null;
  return resolveScope(id, await currentRequestId());
});

export function sessionCookie(id: string, expiresAt: Date) {
  return {
    name: SESSION_COOKIE,
    value: id,
    path: '/',
    expires: expiresAt,
    sameSite: 'lax' as const,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  };
}
