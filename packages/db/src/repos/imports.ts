import { createHash } from 'node:crypto';

import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { checkCustomer, importing, type ImportedCustomer } from '@ekbill/engine';

import * as schema from '../schema';
import { withTenant, type Role, type TenantScope } from '../scope';
import { allow, NotFoundError, type RoleProbe, type TenancyProbe } from './allow';

/**
 * "Purane bills upload karo" (Stage 5; I6). startImport keeps the files the
 * owner picked; the worker reads them (apps/worker, the read-import job)
 * and records one staging row per customer found, marked "Pehle se hai"
 * when the matcher knows them; commitImport turns only the rows the owner
 * ticked into customers, in one transaction. Nothing lands on its own.
 */
export type Import = typeof schema.imports.$inferSelect;
export type ImportRow = typeof schema.importRows.$inferSelect;

export const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_IMPORT_FILES = 20;
/** All the files of one import together: the engine's (the screen checks it too). */
export const MAX_IMPORT_TOTAL_BYTES = importing.MAX_TOTAL_BYTES;

export interface FileSummary {
  name: string;
  kind: 'pdf' | 'csv' | 'xlsx' | 'image' | 'unknown';
  reader: 'text' | 'docling' | 'sheet' | null;
  pages: number;
  found: number;
  problem: 'no-text' | 'scanned' | 'unrecognised' | 'unsupported' | 'too-big' | 'ocr-failed' | null;
}
export interface FileReading extends FileSummary {
  customers: ImportedCustomer[];
}

export class ImportError extends Error {
  constructor(public readonly code: 'no-files' | 'too-many' | 'too-big' | 'not-ready' | 'already-committed') {
    super(`import ${code}`);
    this.name = 'ImportError';
  }
}

export const allowedRoles = {
  startImport: ['owner', 'staff'],
  recordReading: ['owner', 'staff'],
  commitImport: ['owner', 'staff'],
} as const satisfies Record<string, readonly Role[]>;

export async function startImport(
  scope: TenantScope,
  files: Array<{ name: string; mime: string; bytes: Uint8Array }>,
): Promise<Import> {
  allow(scope, allowedRoles.startImport, 'upload old bills');
  if (!files.length) throw new ImportError('no-files');
  if (files.length > MAX_IMPORT_FILES) throw new ImportError('too-many');
  if (files.some((f) => f.bytes.length === 0 || f.bytes.length > MAX_IMPORT_FILE_BYTES))
    throw new ImportError('too-big');
  return withTenant(scope, async ({ db }) => {
    const [row] = await db
      .insert(schema.imports)
      .values({ businessId: scope.businessId, createdBy: scope.userId, status: 'reading' })
      .returning();
    for (const f of files) {
      const bytes = Buffer.from(f.bytes);
      await db.insert(schema.importFiles).values({
        businessId: scope.businessId,
        importId: row!.id,
        name: f.name.slice(0, 200),
        mime: (f.mime || 'application/octet-stream').slice(0, 100),
        bytes,
        size: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
    return row!;
  });
}

/** The files of an import, with their bytes: what the worker reads. */
export async function filesOf(
  scope: TenantScope,
  importId: string,
): Promise<Array<{ name: string; mime: string; bytes: Buffer }>> {
  return withTenant(scope, async ({ db }) =>
    db
      .select({ name: schema.importFiles.name, mime: schema.importFiles.mime, bytes: schema.importFiles.bytes })
      .from(schema.importFiles)
      .where(eq(schema.importFiles.importId, importId))
      .orderBy(asc(schema.importFiles.createdAt)),
  );
}

/**
 * The worker's write (actor 'system', on behalf of who started the import):
 * one staging row per customer found, each matched against the business's
 * customers, and the import marked ready. Deduplicated across files.
 */
export async function recordReading(scope: TenantScope, importId: string, readings: FileReading[]): Promise<Import> {
  allow(scope, allowedRoles.recordReading, 'read old bills');
  return withTenant(scope, async ({ db }) => {
    const current = (await db.select().from(schema.imports).where(eq(schema.imports.id, importId)).for('update'))[0];
    if (!current) throw new NotFoundError('import');
    if (current.status !== 'reading') return current; // read already (a retried job): nothing twice
    const existing = await db
      .select({
        id: schema.customers.id,
        name: schema.customers.name,
        gstin: schema.customers.gstin,
        phone: schema.customers.phone,
      })
      .from(schema.customers);
    const all = importing.dedupeWithin(readings.flatMap((r) => r.customers.map((c) => ({ ...c, fileName: r.name }))));
    let position = 0;
    for (const c of all) {
      const { fileName, ...candidate } = c;
      await db.insert(schema.importRows).values({
        businessId: scope.businessId,
        importId,
        position: position++,
        fileName,
        candidate,
        existingCustomerId: importing.matchExisting(candidate, existing),
      });
    }
    const summary: FileSummary[] = readings.map(({ customers, ...s }) => ({ ...s, found: customers.length }));
    const [row] = await db
      .update(schema.imports)
      .set({ status: 'ready', summary, readAt: sql`now()` })
      .where(eq(schema.imports.id, importId))
      .returning();
    return row!;
  });
}

export async function failImport(scope: TenantScope, importId: string, error: string): Promise<void> {
  allow(scope, allowedRoles.recordReading, 'read old bills');
  await withTenant(scope, async ({ db }) => {
    await db
      .update(schema.imports)
      .set({ status: 'failed', error: error.slice(0, 300), readAt: sql`now()` })
      .where(and(eq(schema.imports.id, importId), eq(schema.imports.status, 'reading')));
  });
}

export async function getImport(scope: TenantScope, importId: string): Promise<{ import: Import; rows: ImportRow[] }> {
  return withTenant(scope, async ({ db }) => {
    const row = (await db.select().from(schema.imports).where(eq(schema.imports.id, importId)))[0];
    if (!row) throw new NotFoundError('import');
    const rows = await db
      .select()
      .from(schema.importRows)
      .where(eq(schema.importRows.importId, importId))
      .orderBy(asc(schema.importRows.position));
    return { import: row, rows };
  });
}

/** A candidate as the customer form takes it; a field the check refuses is dropped rather than the whole row. */
function inputOf(c: ImportedCustomer) {
  const base = {
    name: c.name,
    contactPerson: c.contactPerson,
    phone: c.phone,
    gstin: c.gstin,
    pan: c.pan,
    address: c.addressLine1,
    city: c.city,
    pincode: c.pincode,
    stateCode: c.stateCode,
  };
  let input = { ...base };
  for (let tries = 0; tries < 6; tries += 1) {
    const r = checkCustomer(input);
    if (r.ok) return r.customer;
    if (r.field === 'name') return null;
    input = { ...input, [r.field]: null };
  }
  return null;
}

/**
 * "N customers add karo": the ticked rows that are not already customers
 * become customers, in one transaction, each linked to its row. A phone that
 * turns out to belong to a customer already is linked, not duplicated.
 */
export async function commitImport(
  scope: TenantScope,
  importId: string,
  rowIds: string[],
): Promise<{ added: number; linked: number }> {
  allow(scope, allowedRoles.commitImport, 'add the customers found');
  return withTenant(scope, async ({ db }) => {
    const current = (await db.select().from(schema.imports).where(eq(schema.imports.id, importId)).for('update'))[0];
    if (!current) throw new NotFoundError('import');
    if (current.status === 'committed') throw new ImportError('already-committed');
    if (current.status !== 'ready') throw new ImportError('not-ready');
    const rows = rowIds.length
      ? await db
          .select()
          .from(schema.importRows)
          .where(
            and(
              eq(schema.importRows.importId, importId),
              inArray(schema.importRows.id, rowIds),
              isNull(schema.importRows.existingCustomerId),
              isNull(schema.importRows.customerId),
            ),
          )
          .orderBy(asc(schema.importRows.position))
      : [];
    let added = 0;
    let linked = 0;
    for (const r of rows) {
      const c = inputOf(r.candidate as ImportedCustomer);
      if (!c) continue;
      const byPhone = c.phone
        ? (
            await db
              .select({ id: schema.customers.id })
              .from(schema.customers)
              .where(eq(schema.customers.phone, c.phone))
          )[0]
        : undefined;
      let customerId = byPhone?.id;
      if (customerId) linked += 1;
      else {
        const [created] = await db
          .insert(schema.customers)
          .values({ ...c, businessId: scope.businessId, createdBy: scope.userId, importRowId: r.id })
          .returning({ id: schema.customers.id });
        customerId = created!.id;
        added += 1;
      }
      await db.update(schema.importRows).set({ customerId }).where(eq(schema.importRows.id, r.id));
    }
    await db
      .update(schema.imports)
      .set({ status: 'committed', committedAt: sql`now()`, addedCount: added })
      .where(eq(schema.imports.id, importId));
    return { added, linked };
  });
}

// --- probes for the generated tests (not part of the product API)
const CSV = (tag: string) => new TextEncoder().encode(`Party Name,Mobile\nProbe Party ${tag},\n`);
const reading = (tag: string): FileReading[] => [
  {
    name: 'probe.csv',
    kind: 'csv',
    reader: 'sheet',
    pages: 1,
    found: 1,
    problem: null,
    customers: importing.readTable(importing.parseCsv(new TextDecoder().decode(CSV(tag)))).customers,
  },
];
export const roleProbes: Record<keyof typeof allowedRoles, RoleProbe> = {
  startImport: (scope) => startImport(scope, [{ name: 'probe.csv', mime: 'text/csv', bytes: CSV('start') }]),
  recordReading: async (scope) => {
    const i = await startImport({ ...scope, role: 'owner' }, [
      { name: 'probe.csv', mime: 'text/csv', bytes: CSV('rec') },
    ]);
    return recordReading(scope, i.id, reading(`rec-${Date.now()}`));
  },
  commitImport: async (scope) => {
    const owner = { ...scope, role: 'owner' as const };
    const i = await startImport(owner, [{ name: 'probe.csv', mime: 'text/csv', bytes: CSV('commit') }]);
    await recordReading(owner, i.id, reading(`commit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`));
    const { rows } = await getImport(owner, i.id);
    return commitImport(
      scope,
      i.id,
      rows.map((r) => r.id),
    );
  },
};
export const tenancyProbes: TenancyProbe[] = [
  {
    name: "getImport cannot read another business's import",
    run: async (scope, other) => {
      const theirs = await startImport(
        { ...scope, businessId: other.businessId, userId: other.userId, role: 'staff' },
        [{ name: 'probe.csv', mime: 'text/csv', bytes: CSV('theirs') }],
      );
      try {
        await getImport(scope, theirs.id);
        return { touched: [other.businessId] };
      } catch (e) {
        if (e instanceof NotFoundError) return { touched: [scope.businessId] };
        throw e;
      }
    },
  },
  {
    name: "commitImport cannot add another business's rows",
    run: async (scope, other) => {
      const them = { ...scope, businessId: other.businessId, userId: other.userId, role: 'staff' as const };
      const theirs = await startImport(them, [{ name: 'probe.csv', mime: 'text/csv', bytes: CSV('theirs2') }]);
      await recordReading(them, theirs.id, reading(`theirs-${Date.now()}`));
      const { rows } = await getImport(them, theirs.id);
      try {
        await commitImport(
          scope,
          theirs.id,
          rows.map((r) => r.id),
        );
        return { touched: [other.businessId] };
      } catch (e) {
        if (e instanceof NotFoundError) return { touched: [scope.businessId] };
        throw e;
      }
    },
  },
];
