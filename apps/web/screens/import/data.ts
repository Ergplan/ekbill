import { NotFoundError, imports, type FileSummary } from '@ekbill/db';
import type { ImportedCustomer } from '@ekbill/engine';

import { FIXTURE } from '../fixtures';
import type { Viewer } from '../viewer';

export interface ImportPreviewRow {
  /** The staging row's id (import_rows.id); the fixture name in a look. */
  id: string;
  name: string;
  phone: string | null;
  gstin: string | null;
  exists: boolean;
  /** Where it was read from: the file and the label or column. */
  from: string | null;
}
export interface ImportData {
  state: 'pick' | 'reading' | 'rows' | 'done' | 'failed';
  /** The import being read or shown (Stage 5); null in a look. */
  importId: string | null;
  /** Whether the screen uploads for real (a session) or plays the prototype (a look). */
  live: boolean;
  preview: { files: string[]; rows: ImportPreviewRow[]; summary: FileSummary[] };
  added: number;
}

const STATES = ['pick', 'reading', 'rows', 'done'] as const;

export async function loadImport(
  viewer: Viewer,
  opts: { state: string | null; n: string | null; id: string | null },
): Promise<ImportData | null> {
  if (!viewer.business || viewer.role === 'accountant') return null;
  const n = Number(opts.n);
  const added = Number.isInteger(n) && n >= 0 ? n : 0;
  const requested = STATES.find((s) => s === opts.state) ?? 'pick';
  const scope = viewer.session?.scope;
  if (!scope) {
    return {
      state: requested,
      importId: null,
      live: false,
      preview: {
        files: FIXTURE.importPreview.files,
        rows: FIXTURE.importPreview.rows.map((r) => ({ ...r, id: r.name, from: null })),
        summary: [],
      },
      added: Math.min(added, FIXTURE.importPreview.rows.length),
    };
  }
  if (!opts.id || !/^[0-9a-f-]{36}$/i.test(opts.id) || requested === 'pick') {
    return {
      state: requested === 'done' ? 'done' : 'pick',
      importId: null,
      live: true,
      preview: { files: [], rows: [], summary: [] },
      added,
    };
  }
  let found: Awaited<ReturnType<typeof imports.getImport>>;
  try {
    found = await imports.getImport(scope, opts.id);
  } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
  const status = found.import.status;
  const state: ImportData['state'] =
    status === 'reading'
      ? 'reading'
      : status === 'failed'
        ? 'failed'
        : status === 'committed'
          ? 'done'
          : requested === 'reading'
            ? 'rows'
            : requested;
  const summary = found.import.summary as FileSummary[];
  return {
    state,
    importId: found.import.id,
    live: true,
    preview: {
      files: summary.map((f) => f.name),
      summary,
      rows: found.rows.map((r) => {
        const c = r.candidate as ImportedCustomer;
        return {
          id: r.id,
          name: c.name,
          phone: c.phone,
          gstin: c.gstin,
          exists: r.existingCustomerId !== null || r.customerId !== null,
          from: `${r.fileName} · ${c.source}`,
        };
      }),
    },
    added: status === 'committed' ? (found.import.addedCount ?? added) : added,
  };
}
