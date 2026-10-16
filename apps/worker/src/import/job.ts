import { businesses, imports, type TenantScope } from '@ekbill/db';

import { readFile } from './read-file';

/**
 * The read-import job: the files of one import, read one by one, the
 * customers found recorded as staging rows (I6). It acts for the person who
 * started the import, as the system (audit rows say actor_kind = 'system').
 */
export const READ_IMPORT = 'read-import';

export interface ReadImportJob {
  importId: string;
  businessId: string;
  userId: string;
  role: TenantScope['role'];
  requestId: string;
}

/**
 * `final`: this is the last attempt. Only then does an error mark the import failed (Stage 11 review: the first
 * error made it final, and the retry that might have read it recorded nothing and logged a success).
 */
export async function runReadImport(
  job: ReadImportJob,
  { final = true }: { final?: boolean } = {},
): Promise<{ found: number }> {
  const scope: TenantScope = {
    businessId: job.businessId,
    userId: job.userId,
    role: job.role,
    requestId: job.requestId,
    actorKind: 'system',
  };
  try {
    const profile = await businesses.getProfile(scope);
    const owner = { gstin: profile.gstin, pan: profile.pan, phone: profile.phone, name: profile.legalName };
    const files = await imports.filesOf(scope, job.importId);
    const readings = [];
    for (const f of files) readings.push(await readFile(f.name, new Uint8Array(f.bytes), owner));
    await imports.recordReading(scope, job.importId, readings);
    return { found: readings.reduce((s, r) => s + r.found, 0) };
  } catch (error) {
    if (final) await imports.failImport(scope, job.importId, (error as Error).message).catch(() => undefined);
    throw error;
  }
}
