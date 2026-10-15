import { FIXTURE, type Fixture } from '../fixtures';
import type { Viewer } from '../viewer';

export interface ImportData {
  state: 'pick' | 'reading' | 'rows' | 'done';
  preview: Fixture['importPreview'];
  added: number;
}

const STATES = ['pick', 'reading', 'rows', 'done'] as const;

/** The import screen's data: the step from the URL, the preview rows, and the count the rows step added. */
export function loadImport(viewer: Viewer, opts: { state: string | null; n: string | null }): ImportData | null {
  if (!viewer.business || viewer.role === 'accountant') return null;
  const state = STATES.find((s) => s === opts.state) ?? 'pick';
  const n = Number(opts.n);
  return {
    state,
    preview: FIXTURE.importPreview,
    added: Number.isInteger(n) && n >= 0 ? Math.min(n, FIXTURE.importPreview.rows.length) : 0,
  };
}
