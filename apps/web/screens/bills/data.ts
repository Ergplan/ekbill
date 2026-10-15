import { billsOf, rowOf, type RowData } from '../common';
import type { Viewer } from '../viewer';

export interface BillsData {
  rows: RowData[];
  series: string[];
}

/** Every bill of the business, newest first; the series the business uses. */
export function loadBills(viewer: Viewer): BillsData {
  const b = viewer.business;
  if (!b) return { rows: [], series: [] };
  return { rows: billsOf(b).map((x) => rowOf(b, x)), series: b.series.map((s) => s.prefix) };
}
