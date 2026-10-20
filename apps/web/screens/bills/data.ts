import type { RowData } from '../common';
import { ledgerOf } from '../live';
import type { Viewer } from '../viewer';

export interface BillsData {
  rows: RowData[];
  series: string[];
  /** The kaccha bills (estimates, 20 Oct), newest first, each with the pakka bill made from it. */
  estimates: Array<RowData & { pakka: string | null }>;
}

/** Every bill of the business, newest first (Stage 6: the documents, for a session); the series the business uses. */
export async function loadBills(viewer: Viewer): Promise<BillsData> {
  const b = viewer.business;
  if (!b) return { rows: [], series: [], estimates: [] };
  const [ledger, kaccha] = await Promise.all([ledgerOf(viewer), ledgerOf(viewer, { estimates: true })]);
  return {
    rows: ledger.rows,
    series: b.series.map((s) => s.prefix),
    estimates: kaccha.rows.map((r, i) => ({ ...r, pakka: kaccha.bills[i]?.pakkaNumber ?? null })),
  };
}
