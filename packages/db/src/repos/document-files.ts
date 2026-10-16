import { createHash } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import * as schema from '../schema';
import { withTenant, type Role, type TenantScope } from '../scope';
import { allow, NotFoundError, type RoleProbe, type TenancyProbe } from './allow';

/**
 * A bill as a file (Stage 6): one row per document, format, paper and
 * design, written once from the issued snapshot (I2) and served to the
 * members of the business. The renderer (packages/render) makes the bytes;
 * this module keeps them.
 */
export type FileKind = 'pdf' | 'jpg';
export type Paper = 'a4' | 'a5' | '80mm' | '58mm';
export type Design = 'classic' | 'modern' | 'simple';
export interface DocumentFile {
  id: string;
  documentId: string;
  kind: FileKind;
  paper: Paper;
  design: Design;
  size: number;
  sha256: string;
  renderMs: number | null;
}

export const allowedRoles = {
  // The accountant's prints are kept too (Stage 11 review): a kept file is the issued snapshot printed, not a
  // change to the books, and without it every download of theirs started Chromium again.
  storeRendering: ['owner', 'staff', 'accountant'],
} as const satisfies Record<string, readonly Role[]>;

const meta = {
  id: schema.documentFiles.id,
  documentId: schema.documentFiles.documentId,
  kind: schema.documentFiles.kind,
  paper: schema.documentFiles.paper,
  design: schema.documentFiles.design,
  size: schema.documentFiles.size,
  sha256: schema.documentFiles.sha256,
  renderMs: schema.documentFiles.renderMs,
};

/** Keep a rendering; a second store of the same combination keeps the first (a file is written once). */
export async function storeRendering(
  scope: TenantScope,
  input: { documentId: string; kind: FileKind; paper: Paper; design: Design; bytes: Uint8Array; renderMs?: number },
): Promise<DocumentFile> {
  allow(scope, allowedRoles.storeRendering, 'keep a bill file');
  const bytes = Buffer.from(input.bytes);
  return withTenant(scope, async ({ db }) => {
    const doc = (
      await db
        .select({ status: schema.documents.status })
        .from(schema.documents)
        .where(eq(schema.documents.id, input.documentId))
    )[0];
    if (!doc || doc.status === 'draft') throw new NotFoundError('document');
    const [row] = await db
      .insert(schema.documentFiles)
      .values({
        businessId: scope.businessId,
        documentId: input.documentId,
        kind: input.kind,
        paper: input.paper,
        design: input.design,
        bytes,
        size: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        renderMs: input.renderMs ?? null,
      })
      .onConflictDoNothing()
      .returning(meta);
    if (row) return row as DocumentFile;
    const existing = (
      await db
        .select(meta)
        .from(schema.documentFiles)
        .where(
          and(
            eq(schema.documentFiles.documentId, input.documentId),
            eq(schema.documentFiles.kind, input.kind),
            eq(schema.documentFiles.paper, input.paper),
            eq(schema.documentFiles.design, input.design),
          ),
        )
    )[0];
    return existing as DocumentFile;
  });
}

export async function findRendering(
  scope: TenantScope,
  q: { documentId: string; kind: FileKind; paper: Paper; design: Design },
): Promise<(DocumentFile & { bytes: Buffer }) | null> {
  return withTenant(scope, async ({ db }) => {
    const row = (
      await db
        .select({ ...meta, bytes: schema.documentFiles.bytes })
        .from(schema.documentFiles)
        .where(
          and(
            eq(schema.documentFiles.documentId, q.documentId),
            eq(schema.documentFiles.kind, q.kind),
            eq(schema.documentFiles.paper, q.paper),
            eq(schema.documentFiles.design, q.design),
          ),
        )
    )[0];
    return (row as (DocumentFile & { bytes: Buffer }) | undefined) ?? null;
  });
}

export async function renderingsOf(scope: TenantScope, documentId: string): Promise<DocumentFile[]> {
  return withTenant(
    scope,
    async ({ db }) =>
      (await db
        .select(meta)
        .from(schema.documentFiles)
        .where(eq(schema.documentFiles.documentId, documentId))) as DocumentFile[],
  );
}

// --- probes for the generated tests (not part of the product API)
const PDF = new TextEncoder().encode('%PDF-1.4\n%probe\n');
async function probeBill(scope: TenantScope): Promise<string> {
  const { probeIssuedBill } = await import('./documents');
  return probeIssuedBill(scope, 'Probe Printed');
}
export const roleProbes: Record<keyof typeof allowedRoles, RoleProbe> = {
  storeRendering: async (scope) =>
    storeRendering(scope, {
      documentId: await probeBill(scope),
      kind: 'pdf',
      paper: 'a4',
      design: 'classic',
      bytes: PDF,
    }),
};
export const tenancyProbes: TenancyProbe[] = [
  {
    name: "findRendering cannot read another business's bill file",
    run: async (scope, other) => {
      const them = { ...scope, businessId: other.businessId, userId: other.userId, role: 'owner' as const };
      const theirs = await probeBill(them);
      await storeRendering(them, { documentId: theirs, kind: 'pdf', paper: 'a4', design: 'classic', bytes: PDF });
      const found = await findRendering(scope, { documentId: theirs, kind: 'pdf', paper: 'a4', design: 'classic' });
      return { touched: found ? [other.businessId] : [scope.businessId] };
    },
  },
];
