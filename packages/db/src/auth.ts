import 'server-only';

import { and, eq, gt, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';

import { getPool } from './pool';
import * as schema from './schema';
import type { Role, TenantScope } from './scope';

/**
 * Sessions and the scope they resolve to (I1: read once per request, before
 * a scope exists, outside RLS: sessions, users and memberships carry no
 * business data). The build's sessions come from /dev/switch
 * (AUTH_MODE=switcher); Stage 10 issues them after an OTP.
 */
export interface SessionUser {
  id: string;
  name: string;
  phoneE164: string;
  theme: 'narangi' | 'harmony' | 'system';
  language: 'hi-Latn' | 'en';
}
export interface Resolved {
  sessionId: string;
  user: SessionUser;
  business: { id: string; tradeName: string; legalName: string; status: string } | null;
  role: Role | null;
  /** Null for a user with no business yet (the welcome flow). */
  scope: TenantScope | null;
}

export const SESSION_DAYS = 30;

const db = () => drizzle(getPool(), { schema });

/** The scope a session id resolves to, or null when it is unknown, expired, or its membership is no longer active. */
export async function resolveScope(sessionId: string, requestId: string): Promise<Resolved | null> {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return null;
  const rows = await db()
    .select({
      sessionId: schema.sessions.id,
      businessId: schema.sessions.businessId,
      role: schema.sessions.role,
      user: {
        id: schema.users.id,
        name: schema.users.name,
        phoneE164: schema.users.phoneE164,
        theme: schema.users.theme,
        language: schema.users.language,
      },
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, sessionId), gt(schema.sessions.expiresAt, sql`now()`)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const user = row.user as SessionUser;
  if (!row.businessId) return { sessionId: row.sessionId, user, business: null, role: null, scope: null };
  const member = await db()
    .select({
      role: schema.memberships.role,
      business: {
        id: schema.businesses.id,
        tradeName: schema.businesses.tradeName,
        legalName: schema.businesses.legalName,
        status: schema.businesses.status,
      },
    })
    .from(schema.memberships)
    .innerJoin(schema.businesses, eq(schema.businesses.id, schema.memberships.businessId))
    .where(
      and(
        eq(schema.memberships.businessId, row.businessId),
        eq(schema.memberships.userId, user.id),
        eq(schema.memberships.status, 'active'),
      ),
    )
    .limit(1);
  const m = member[0];
  if (!m) return null; // removed from the business since the session was made: the session is dead
  const role = m.role as Role;
  return {
    sessionId: row.sessionId,
    user,
    business: m.business,
    role,
    scope: { businessId: m.business.id, userId: user.id, role, requestId },
  };
}

/** A new session for a user, bound to one of their active memberships (or none for a brand-new owner). */
export async function createSession(input: {
  userId: string;
  businessId: string | null;
  userAgent?: string | null;
}): Promise<{ id: string; expiresAt: Date }> {
  let role: Role | null = null;
  if (input.businessId) {
    const m = await db()
      .select({ role: schema.memberships.role })
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.businessId, input.businessId),
          eq(schema.memberships.userId, input.userId),
          eq(schema.memberships.status, 'active'),
        ),
      )
      .limit(1);
    if (!m[0]) throw new Error('no active membership for that business');
    role = m[0].role as Role;
  }
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const [row] = await db()
    .insert(schema.sessions)
    .values({ userId: input.userId, businessId: input.businessId, role, expiresAt, userAgent: input.userAgent ?? null })
    .returning({ id: schema.sessions.id });
  await db()
    .update(schema.users)
    .set({ lastSeenAt: sql`now()` })
    .where(eq(schema.users.id, input.userId));
  return { id: row!.id, expiresAt };
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db().delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
}

/** The businesses a user may act for, with the role: what /dev/switch lists and a sign-in offers. */
export async function membershipsOf(
  userId: string,
): Promise<Array<{ businessId: string; tradeName: string; role: Role }>> {
  const rows = await db()
    .select({
      businessId: schema.memberships.businessId,
      tradeName: schema.businesses.tradeName,
      role: schema.memberships.role,
    })
    .from(schema.memberships)
    .innerJoin(schema.businesses, eq(schema.businesses.id, schema.memberships.businessId))
    .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.status, 'active')));
  return rows.map((r) => ({ ...r, role: r.role as Role }));
}
