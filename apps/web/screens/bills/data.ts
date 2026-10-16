import type { RowData } from '../common';
import { ledgerOf } from '../live';
import type { Viewer } from '../viewer';

export interface BillsData {
  rows: RowData[];
  series: string[];
}

/** Every bill of the business, newest first (Stage 6: the documents, for a session); the series the business uses. */
export async function loadBills(viewer: Viewer): Promise<BillsData> {
  const b = viewer.business;
  if (!b) return { rows: [], series: [] };
  const ledger = await ledgerOf(viewer);
  return { rows: ledger.rows, series: b.series.map((s) => s.prefix) };
}
