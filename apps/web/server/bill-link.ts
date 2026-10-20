import 'server-only';

import { billLinks, documents, type Document, type TenantScope } from '@ekbill/db';

/**
 * A bill's own link, opened (20 Oct): the business's owner as the reader (actor 'system': nobody signed in), the one
 * document the token names, and nothing else. Null for a token that names nothing, or a document no longer issued.
 */
export async function openBill(
  token: string,
  requestId: string,
): Promise<{ scope: TenantScope; doc: Document } | null> {
  const link = await billLinks.openLink(token, requestId);
  if (!link) return null;
  const scope: TenantScope = {
    businessId: link.businessId,
    userId: link.ownerId,
    role: 'owner',
    requestId,
    actorKind: 'system',
  };
  const doc = await documents.getDocument(scope, link.documentId).catch(() => null);
  if (!doc || doc.status === 'draft' || !doc.issuedSnapshot) return null;
  return { scope, doc };
}
