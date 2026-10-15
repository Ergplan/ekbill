import { rowOf, unpaidOf, type RowData } from '../common';
import type { Viewer } from '../viewer';

export interface DuesData {
  totalPaise: number;
  rows: RowData[];
}

/** Every unpaid bill, oldest first (8.0). */
export function loadDues(viewer: Viewer): DuesData {
  const b = viewer.business;
  if (!b) return { totalPaise: 0, rows: [] };
  const rows = unpaidOf(b).map((x) => rowOf(b, x));
  return { totalPaise: rows.reduce((s, r) => s + r.duePaise, 0), rows };
}
