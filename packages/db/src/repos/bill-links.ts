import { randomBytes } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import * as schema from '../schema';
import { withTenant, withUser, type Role, type TenantScope } from '../scope';
import { allow, NotFoundError, type RoleProbe, type TenancyProbe } from './allow';
import { probeIssuedBill } from './documents';

/**
 * A bill's own link (20 Oct): the WhatsApp message carries it, so the bill reaches a customer whose number the
 * shopkeeper has never saved (wa.me opens the chat by the number typed; a file can only go by the phone's share
 * sheet, which lists saved contacts). One link per issued document, made the first time it is shared, never changed;
 * the token (128 random bits) is the only key, and the public bill page reads the one row it names (RLS by_token).
 */
export const allowedRoles = {
  linkFor: ['owner', 'staff'],
} as const satisfies Record<string, readonly Role[]>;

/** 16 random bytes, base64url: 22 characters, the shape the table's check holds. */
const newToken = () => randomBytes(16).toString('base64url');

/** The document's link token: the one it has, else a new one. Issued or cancelled documents only (not a draft). */
export async function linkFor(scope: TenantScope, documentId: string): Promise<string> {
  allow(scope, allowedRoles.linkFor, 'share a bill');
  return withTenant(scope, async ({ db }) => {
    const doc = (
      await db
        .select({ id: schema.documents.id, status: schema.documents.status })
        .from(schema.documents)
        .where(eq(schema.documents.id, documentId))
    )[0];
    if (!doc || doc.status === 'draft') throw new NotFoundError('document');
    const had = async () =>
      (
        await db
          .select({ token: schema.billLinks.token })
          .from(schema.billLinks)
          .where(and(eq(schema.billLinks.businessId, scope.businessId), eq(schema.billLinks.documentId, doc.id)))
      )[0]?.token;
    const existing = await had();
    if (existing) return existing;
    // Two shares at once both reach here: the document's unique link keeps one, and both answer with it.
    await db
      .insert(schema.billLinks)
      .values({ token: newToken(), businessId: scope.businessId, documentId: doc.id, createdBy: scope.userId })
      .onConflictDoNothing({ target: schema.billLinks.documentId });
    const made = await had();
    if (!made) throw new NotFoundError('bill link');
    return made;
  });
}

/**
 * What a token opens, for the public bill page: the business, the document and the business's owner (the page
 * prints as them, actor 'system'). Null for a token that names nothing. No session is needed; nothing else is read.
 */
export async function openLink(
  token: string,
  requestId: string,
): Promise<{ businessId: string; documentId: string; ownerId: string } | null> {
  if (!/^[A-Za-z0-9_-]{22}$/.test(token)) return null;
  return withUser({ userId: null, requestId, actorKind: 'system' }, async ({ db, client }) => {
    await client.query("select set_config('app.bill_link', $1, true)", [token]);
    const link = (
      await db
        .select({ businessId: schema.billLinks.businessId, documentId: schema.billLinks.documentId })
        .from(schema.billLinks)
        .where(eq(schema.billLinks.token, token))
    )[0];
    if (!link) return null;
    const owner = (
      await db
        .select({ userId: schema.memberships.userId })
        .from(schema.memberships)
        .where(
          and(
            eq(schema.memberships.businessId, link.businessId),
            eq(schema.memberships.role, 'owner'),
            eq(schema.memberships.status, 'active'),
          ),
        )
        .limit(1)
    )[0];
    return owner ? { ...link, ownerId: owner.userId } : null;
  });
}

// --- probes for the generated tests (not part of the product API)
export const roleProbes: Record<keyof typeof allowedRoles, RoleProbe> = {
  linkFor: async (scope) => linkFor(scope, await probeIssuedBill(scope, 'Probe Link')),
};
export const tenancyProbes: TenancyProbe[] = [
  {
    name: "linkFor cannot make a link to another business's bill",
    run: async (scope, other) => {
      const theirs = await probeIssuedBill(
        { ...scope, businessId: other.businessId, userId: other.userId, role: 'owner' },
        'Probe Link',
      );
      try {
        await linkFor({ ...scope, role: 'owner' }, theirs);
        return { touched: [other.businessId] };
      } catch (e) {
        if (e instanceof NotFoundError) return { touched: [scope.businessId] };
        throw e;
      }
    },
  },
  {
    name: 'openLink opens only the business its token names',
    run: async (scope) => {
      const mine = await probeIssuedBill({ ...scope, role: 'owner' }, 'Probe Link');
      const token = await linkFor({ ...scope, role: 'owner' }, mine);
      const opened = await openLink(token, scope.requestId);
      return { touched: opened ? [opened.businessId] : [] };
    },
  },
];
