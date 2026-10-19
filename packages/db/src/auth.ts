import 'server-only';

import { and, asc, eq, gt, sql } from 'drizzle-orm';
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
  language: 'hi-Latn' | 'en' | 'hi' | 'mr' | 'ta';
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
  // A UUID's own shape: 36 hyphens would pass a looser test and reach Postgres as an invalid uuid (a 500).
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) return null;
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

/** After the setup makes a brand-new owner's business: the session now acts for it (their active owner membership). */
export async function adoptBusiness(sessionId: string, userId: string, businessId: string): Promise<void> {
  const m = await db()
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.businessId, businessId),
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.status, 'active'),
      ),
    )
    .limit(1);
  if (!m[0]) throw new Error('no active membership for that business');
  await db()
    .update(schema.sessions)
    .set({ businessId, role: m[0].role })
    .where(and(eq(schema.sessions.id, sessionId), eq(schema.sessions.userId, userId)));
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db().delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
}

/** Sign a person out everywhere (a lost or shared phone): every session of theirs ends. Answers how many. */
export async function deleteSessionsOf(userId: string): Promise<number> {
  const gone = await db()
    .delete(schema.sessions)
    .where(eq(schema.sessions.userId, userId))
    .returning({ id: schema.sessions.id });
  return gone.length;
}

/**
 * The invites waiting for a phone become memberships when that phone signs in
 * (the switcher during the build; OTP in Stage 10). Answers how many.
 */
export async function acceptInvites(userId: string, requestId = 'accept-invites'): Promise<number> {
  // Across businesses (an invite is the business's row, not yet the person's), so outside a tenant scope;
  // but the person and the request are set, so the audit trail says who accepted and when (Stage 9 review).
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query(
      "select set_config('app.user_id', $1, true), set_config('app.actor_kind', 'user', true), set_config('app.request_id', $2, true)",
      [userId, requestId],
    );
    const rows = await drizzle(client, { schema })
      .update(schema.memberships)
      .set({ status: 'active', acceptedAt: sql`now()` })
      .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.status, 'invited')))
      .returning({ id: schema.memberships.id });
    await client.query('commit');
    return rows.length;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** A person by phone (E.164), for a sign-in by number. */
export async function userByPhone(phoneE164: string): Promise<{ id: string; theme: string; language: string } | null> {
  const row = (
    await db()
      .select({ id: schema.users.id, theme: schema.users.theme, language: schema.users.language })
      .from(schema.users)
      .where(eq(schema.users.phoneE164, phoneE164))
      .limit(1)
  )[0];
  return row ?? null;
}

/** The name a person has until they say theirs: Home asks "Apne baare mein batao" and greets no one by it (19 Oct). */
export const NEW_USER_NAME = 'Naya user';
/** The same for someone invited without a name (the owner gave only a phone). */
export const NEW_MEMBER_NAME = 'Naya member';

/** A name the person has said themselves, not one of the two placeholders: Home greets them by it. */
export function isOwnName(name: string): boolean {
  const n = name.trim();
  return n !== '' && n !== NEW_USER_NAME && n !== NEW_MEMBER_NAME;
}

/**
 * The person with this phone, made on their first sign-in (Stage 10, OTP): the phone is the
 * identity, the name a placeholder the welcome screen asks them to change.
 */
export async function userForPhone(phoneE164: string): Promise<{ id: string; theme: string; language: string }> {
  const found = await userByPhone(phoneE164);
  if (found) return found;
  await db()
    .insert(schema.users)
    .values({ phoneE164, name: NEW_USER_NAME })
    .onConflictDoNothing({ target: schema.users.phoneE164 });
  return (await userByPhone(phoneE164))!;
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
    .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.status, 'active')))
    // The first is where a sign-in lands: the business the person owns, else the one they joined first, never
    // whichever row the scan returned (Stage 11 review: an accepted invite could take an owner out of their own).
    .orderBy(
      sql`case when ${schema.memberships.role} = 'owner' then 0 else 1 end`,
      asc(schema.memberships.acceptedAt),
      asc(schema.memberships.businessId),
    );
  return rows.map((r) => ({ ...r, role: r.role as Role }));
}
