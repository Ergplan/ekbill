import type { RowData } from '../common';
import { ledgerOf, unpaidRows } from '../live';
import type { Viewer } from '../viewer';

export interface DuesData {
  totalPaise: number;
  rows: RowData[];
}

/** Every unpaid bill, oldest first (8.0); what is due is the engine's balanceOf for each (Stage 6). */
export async function loadDues(viewer: Viewer): Promise<DuesData> {
  if (!viewer.business) return { totalPaise: 0, rows: [] };
  const rows = unpaidRows(await ledgerOf(viewer, { status: 'due' }));
  return { totalPaise: rows.reduce((s, r) => s + r.duePaise, 0), rows };
}
