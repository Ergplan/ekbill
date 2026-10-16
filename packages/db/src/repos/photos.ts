import { createHash } from 'node:crypto';

import { and, asc, eq, sql } from 'drizzle-orm';

import * as schema from '../schema';
import { withTenant, type Role, type TenantScope } from '../scope';
import { allow, NotFoundError, type RoleProbe, type TenancyProbe } from './allow';

/**
 * Photo → bill (Stage 7). A picked photo is kept as it came (`uploads`);
 * the worker reads it into an extraction as the model (I6: staging only,
 * the trigger guard_extraction lets a model write nothing else); the owner
 * reviews, corrects (each change a row) and makes the bill through Stage 6's
 * path, which commits the extraction to the issued document.
 */
export type Extraction = Omit<typeof schema.extractions.$inferSelect, 'image'>;
export type Correction = typeof schema.extractionCorrections.$inferSelect;

export const PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;

export class PhotoError extends Error {
  constructor(public readonly code: 'empty' | 'too-big' | 'not-a-photo' | 'not-ready' | 'final') {
    super(`photo: ${code}`);
    this.name = 'PhotoError';
  }
}

export const allowedRoles = {
  startRead: ['owner', 'staff'],
  recordReading: ['owner', 'staff'],
  recordCorrections: ['owner', 'staff'],
  commitReading: ['owner', 'staff'],
  discardReading: ['owner', 'staff'],
} as const satisfies Record<string, readonly Role[]>;

const meta = {
  id: schema.extractions.id,
  businessId: schema.extractions.businessId,
  uploadId: schema.extractions.uploadId,
  status: schema.extractions.status,
  error: schema.extractions.error,
  model: schema.extractions.model,
  promptVersion: schema.extractions.promptVersion,
  doclingUsed: schema.extractions.doclingUsed,
  result: schema.extractions.result,
  warnings: schema.extractions.warnings,
  matchedCustomerId: schema.extractions.matchedCustomerId,
  matchScorePct: schema.extractions.matchScorePct,
  aiCallId: schema.extractions.aiCallId,
  costMicros: schema.extractions.costMicros,
  latencyMs: schema.extractions.latencyMs,
  committedDocumentId: schema.extractions.committedDocumentId,
  createdBy: schema.extractions.createdBy,
  createdAt: schema.extractions.createdAt,
  updatedAt: schema.extractions.updatedAt,
};

/** The photo picked: kept, and a pending reading started for the worker. */
export async function startRead(
  scope: TenantScope,
  input: { name: string; mime: string; bytes: Uint8Array },
): Promise<{ uploadId: string; extractionId: string; sha256: string }> {
  allow(scope, allowedRoles.startRead, 'read a photo');
  const bytes = Buffer.from(input.bytes);
  if (!bytes.length) throw new PhotoError('empty');
  if (bytes.length > PHOTO_MAX_BYTES) throw new PhotoError('too-big');
  if (!(PHOTO_MIMES as readonly string[]).includes(input.mime)) throw new PhotoError('not-a-photo');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return withTenant(scope, async ({ db }) => {
    const [upload] = await db
      .insert(schema.uploads)
      .values({
        businessId: scope.businessId,
        name: input.name.slice(0, 200) || 'photo',
        mime: input.mime,
        bytes,
        size: bytes.length,
        sha256,
        createdBy: scope.userId,
      })
      .returning({ id: schema.uploads.id });
    const [extraction] = await db
      .insert(schema.extractions)
      .values({ businessId: scope.businessId, uploadId: upload!.id, createdBy: scope.userId })
      .returning({ id: schema.extractions.id });
    return { uploadId: upload!.id, extractionId: extraction!.id, sha256 };
  });
}

/** The photo behind a reading, for the worker. */
export async function photoOf(
  scope: TenantScope,
  extractionId: string,
): Promise<{ name: string; mime: string; bytes: Buffer; sha256: string }> {
  return withTenant(scope, async ({ db }) => {
    const row = (
      await db
        .select({
          name: schema.uploads.name,
          mime: schema.uploads.mime,
          bytes: schema.uploads.bytes,
          sha256: schema.uploads.sha256,
        })
        .from(schema.extractions)
        .innerJoin(schema.uploads, eq(schema.uploads.id, schema.extractions.uploadId))
        .where(eq(schema.extractions.id, extractionId))
    )[0];
    if (!row) throw new NotFoundError('extraction');
    return row;
  });
}

export interface Reading {
  status: 'ready' | 'failed';
  error?: 'unreadable' | 'no-bill' | 'ai-unavailable' | 'invalid' | 'error' | null;
  model?: string | null;
  promptVersion?: string | null;
  doclingUsed?: boolean;
  image?: Buffer | null;
  result?: unknown;
  warnings?: unknown[];
  matchedCustomerId?: string | null;
  matchScorePct?: number | null;
  aiCallId?: string | null;
  costMicros?: number | null;
  latencyMs?: number | null;
}

/** The worker's write: what was read, once (the scope's actor is the model; the trigger allows nothing else). */
export async function recordReading(scope: TenantScope, extractionId: string, reading: Reading): Promise<Extraction> {
  allow(scope, allowedRoles.recordReading, 'record a reading');
  return withTenant(scope, async ({ db }) => {
    const [row] = await db
      .update(schema.extractions)
      .set({
        status: reading.status,
        error: reading.error ?? null,
        model: reading.model ?? null,
        promptVersion: reading.promptVersion ?? null,
        doclingUsed: reading.doclingUsed ?? false,
        image: reading.image ?? null,
        result: reading.result ?? null,
        warnings: reading.warnings ?? [],
        matchedCustomerId: reading.matchedCustomerId ?? null,
        matchScorePct: reading.matchScorePct ?? null,
        aiCallId: reading.aiCallId ?? null,
        costMicros: reading.costMicros ?? null,
        latencyMs: reading.latencyMs ?? null,
        updatedAt: sql`now()`,
      })
      .where(and(eq(schema.extractions.id, extractionId), eq(schema.extractions.status, 'pending')))
      .returning(meta);
    if (!row) throw new NotFoundError('pending extraction');
    return row as Extraction;
  });
}

export async function getExtraction(scope: TenantScope, extractionId: string): Promise<Extraction> {
  return withTenant(scope, async ({ db }) => {
    const row = (await db.select(meta).from(schema.extractions).where(eq(schema.extractions.id, extractionId)))[0];
    if (!row) throw new NotFoundError('extraction');
    return row as Extraction;
  });
}

/** The upright, resized photo the model saw (the review screen shows it). */
export async function imageOf(scope: TenantScope, extractionId: string): Promise<Buffer | null> {
  return withTenant(scope, async ({ db }) => {
    const row = (
      await db
        .select({ image: schema.extractions.image })
        .from(schema.extractions)
        .where(eq(schema.extractions.id, extractionId))
    )[0];
    if (!row) throw new NotFoundError('extraction');
    return row.image ?? null;
  });
}

async function lockReadable(tx: Parameters<Parameters<typeof withTenant>[1]>[0], extractionId: string) {
  const row = (
    await tx.db.select(meta).from(schema.extractions).where(eq(schema.extractions.id, extractionId)).for('update')
  )[0];
  if (!row) throw new NotFoundError('extraction');
  if (row.status === 'committed' || row.status === 'discarded') throw new PhotoError('final');
  if (row.status === 'pending' || row.status === 'failed') throw new PhotoError('not-ready');
  return row;
}

/** The owner's changes on the review screen, one row each (model value, human value). */
export async function recordCorrections(
  scope: TenantScope,
  extractionId: string,
  corrections: Array<{ field: string; modelValue: string | null; humanValue: string | null }>,
): Promise<Correction[]> {
  allow(scope, allowedRoles.recordCorrections, 'correct a reading');
  return withTenant(scope, async (tx) => {
    await lockReadable(tx, extractionId);
    const changed = corrections.filter((c) => (c.modelValue ?? '') !== (c.humanValue ?? '')).slice(0, 200);
    const rows = changed.length
      ? await tx.db
          .insert(schema.extractionCorrections)
          .values(
            changed.map((c) => ({
              businessId: scope.businessId,
              extractionId,
              field: c.field.slice(0, 60),
              modelValue: c.modelValue?.slice(0, 500) ?? null,
              humanValue: c.humanValue?.slice(0, 500) ?? null,
              createdBy: scope.userId,
            })),
          )
          .returning()
      : [];
    await tx.db
      .update(schema.extractions)
      .set({ status: 'reviewed', updatedAt: sql`now()` })
      .where(eq(schema.extractions.id, extractionId));
    return rows;
  });
}

/** "Bill banao" made an issued bill from this reading: it points there, for good. */
export async function commitReading(scope: TenantScope, extractionId: string, documentId: string): Promise<Extraction> {
  allow(scope, allowedRoles.commitReading, 'make a bill from a reading');
  return withTenant(scope, async (tx) => {
    await lockReadable(tx, extractionId);
    const [row] = await tx.db
      .update(schema.extractions)
      .set({ status: 'committed', committedDocumentId: documentId, updatedAt: sql`now()` })
      .where(eq(schema.extractions.id, extractionId))
      .returning(meta);
    return row as Extraction;
  });
}

/** "Naya bill likho" instead: the reading is set aside (nothing is deleted). */
export async function discardReading(scope: TenantScope, extractionId: string): Promise<Extraction> {
  allow(scope, allowedRoles.discardReading, 'set a reading aside');
  return withTenant(scope, async ({ db }) => {
    const current = (await db.select(meta).from(schema.extractions).where(eq(schema.extractions.id, extractionId)))[0];
    if (!current) throw new NotFoundError('extraction');
    if (current.status === 'committed' || current.status === 'discarded') throw new PhotoError('final');
    const [row] = await db
      .update(schema.extractions)
      .set({ status: 'discarded', updatedAt: sql`now()` })
      .where(eq(schema.extractions.id, extractionId))
      .returning(meta);
    return row as Extraction;
  });
}

export async function correctionsOf(scope: TenantScope, extractionId: string): Promise<Correction[]> {
  return withTenant(scope, async ({ db }) =>
    db
      .select()
      .from(schema.extractionCorrections)
      .where(eq(schema.extractionCorrections.extractionId, extractionId))
      .orderBy(asc(schema.extractionCorrections.createdAt)),
  );
}

// --- probes for the generated tests (not part of the product API)
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const READING: Reading = {
  status: 'ready',
  model: 'probe',
  promptVersion: 'read-bill/v1',
  result: { outcome: 'ready', lines: [] },
};
async function ready(scope: TenantScope): Promise<string> {
  const owner = { ...scope, role: 'owner' as const };
  const { extractionId } = await startRead(owner, { name: 'probe.jpg', mime: 'image/jpeg', bytes: JPEG });
  await recordReading({ ...owner, actorKind: 'model' }, extractionId, READING);
  return extractionId;
}
export const roleProbes: Record<keyof typeof allowedRoles, RoleProbe> = {
  startRead: (scope) => startRead(scope, { name: 'probe.jpg', mime: 'image/jpeg', bytes: JPEG }),
  recordReading: async (scope) => {
    const { extractionId } = await startRead(
      { ...scope, role: 'owner' },
      { name: 'probe.jpg', mime: 'image/jpeg', bytes: JPEG },
    );
    return recordReading({ ...scope, actorKind: 'model' }, extractionId, READING);
  },
  recordCorrections: async (scope) =>
    recordCorrections(scope, await ready(scope), [{ field: 'customer', modelValue: 'Mehta', humanValue: 'Mehra' }]),
  commitReading: async (scope) => {
    const id = await ready(scope);
    const { probeIssuedBill } = await import('./documents');
    return commitReading(scope, id, await probeIssuedBill(scope, 'Probe Photo'));
  },
  discardReading: async (scope) => discardReading(scope, await ready(scope)),
};
export const tenancyProbes: TenancyProbe[] = [
  {
    name: "getExtraction cannot read another business's reading",
    run: async (scope, other) => {
      const theirs = await ready({ ...scope, businessId: other.businessId, userId: other.userId });
      try {
        const r = await getExtraction(scope, theirs);
        return { touched: [r.businessId] };
      } catch (e) {
        if (e instanceof NotFoundError) return { touched: [scope.businessId] };
        throw e;
      }
    },
  },
  {
    name: "photoOf cannot fetch another business's photo",
    run: async (scope, other) => {
      const theirs = await ready({ ...scope, businessId: other.businessId, userId: other.userId });
      try {
        await photoOf(scope, theirs);
        return { touched: [other.businessId] };
      } catch (e) {
        if (e instanceof NotFoundError) return { touched: [scope.businessId] };
        throw e;
      }
    },
  },
  {
    name: "recordCorrections cannot write to another business's reading",
    run: async (scope, other) => {
      const theirs = await ready({ ...scope, businessId: other.businessId, userId: other.userId });
      try {
        await recordCorrections(scope, theirs, [{ field: 'customer', modelValue: 'a', humanValue: 'b' }]);
        return { touched: [other.businessId] };
      } catch (e) {
        if (e instanceof NotFoundError) return { touched: [scope.businessId] };
        throw e;
      }
    },
  },
];
