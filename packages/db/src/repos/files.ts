import { createHash } from 'node:crypto';

import { and, desc, eq } from 'drizzle-orm';

import { acceptFile, type BusinessFileKind, type FileProblem } from '@ekbill/engine';

import * as schema from '../schema';
import { withTenant, type Role, type TenantScope } from '../scope';
import { allow, NotFoundError, type RoleProbe, type TenancyProbe } from './allow';

/**
 * A business's files (Stage 4: logo and signature; bytes in Postgres).
 * Each is written once; the business row points at the current one of
 * each kind (businesses.setFile). Reads carry the bytes for the route
 * that serves them to a member of the business.
 */
export interface BusinessFile {
  id: string;
  businessId: string;
  kind: BusinessFileKind;
  mime: string;
  size: number;
  sha256: string;
  createdAt: Date;
}
export interface BusinessFileBytes extends BusinessFile {
  bytes: Buffer;
}

export class FileError extends Error {
  constructor(public readonly problem: FileProblem) {
    super(`file ${problem}`);
    this.name = 'FileError';
  }
}

/** Only the owner changes the look of the bills. */
export const allowedRoles = {
  putFile: ['owner'],
} as const satisfies Record<string, readonly Role[]>;

const meta = {
  id: schema.businessFiles.id,
  businessId: schema.businessFiles.businessId,
  kind: schema.businessFiles.kind,
  mime: schema.businessFiles.mime,
  size: schema.businessFiles.size,
  sha256: schema.businessFiles.sha256,
  createdAt: schema.businessFiles.createdAt,
};

/** Store a data URL as a file of this kind (the engine's limits hold), returning its metadata. */
export async function putFile(scope: TenantScope, kind: BusinessFileKind, dataUrl: string): Promise<BusinessFile> {
  allow(scope, allowedRoles.putFile, 'change the bill look');
  const accepted = acceptFile(kind, dataUrl);
  if (!accepted.ok) throw new FileError(accepted.problem);
  const bytes = Buffer.from(accepted.bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return withTenant(scope, async ({ db }) => {
    const [row] = await db
      .insert(schema.businessFiles)
      .values({
        businessId: scope.businessId,
        kind,
        mime: accepted.mime,
        bytes,
        size: bytes.length,
        sha256,
        createdBy: scope.userId,
      })
      .returning(meta);
    return row as BusinessFile;
  });
}

export async function getFile(scope: TenantScope, id: string): Promise<BusinessFileBytes> {
  return withTenant(scope, async ({ db }) => {
    const row = (await db.select().from(schema.businessFiles).where(eq(schema.businessFiles.id, id)))[0];
    if (!row) throw new NotFoundError('file');
    return row as BusinessFileBytes;
  });
}

export async function listFiles(scope: TenantScope, kind?: BusinessFileKind): Promise<BusinessFile[]> {
  return withTenant(scope, async ({ db }) => {
    const rows = await db
      .select(meta)
      .from(schema.businessFiles)
      .where(
        and(
          eq(schema.businessFiles.businessId, scope.businessId),
          ...(kind ? [eq(schema.businessFiles.kind, kind)] : []),
        ),
      )
      .orderBy(desc(schema.businessFiles.createdAt));
    return rows as BusinessFile[];
  });
}

/** A 1×1 transparent PNG: the probes' file. */
export const PROBE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// --- probes for the generated tests (not part of the product API)
export const roleProbes: Record<keyof typeof allowedRoles, RoleProbe> = {
  putFile: (scope) => putFile(scope, 'logo', PROBE_PNG),
};
export const tenancyProbes: TenancyProbe[] = [
  {
    name: 'listFiles lists only its own files',
    run: async (scope) => ({ touched: [...new Set((await listFiles(scope)).map((f) => f.businessId))] }),
  },
  {
    name: "getFile cannot read another business's file",
    run: async (scope, other) => {
      const theirs = await putFile(
        { ...scope, businessId: other.businessId, userId: other.userId, role: 'owner' },
        'logo',
        PROBE_PNG,
      );
      try {
        await getFile(scope, theirs.id);
        return { touched: [other.businessId] };
      } catch (e) {
        if (e instanceof NotFoundError) return { touched: [scope.businessId] };
        throw e;
      }
    },
  },
];
