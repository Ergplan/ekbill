import { FIXTURE } from '../fixtures';
import { billsOf, customerOf } from '../common';
import type { Viewer } from '../viewer';

export interface GstData {
  period: { label: string; mode: 'month' | 'quarter' };
  bills: number;
  taxablePaise: number;
  gstPaise: number;
  byRate: Array<{ rate: number; taxablePaise: number; cgstPaise: number; sgstPaise: number }>;
  b2b: Array<{ number: string; name: string; gstin: string; totalPaise: number; gstPaise: number }>;
  b2cBills: number;
}

export function loadGst(viewer: Viewer): GstData | null {
  const b = viewer.business;
  if (!b || b.registration !== 'regular') return null;
  const q = FIXTURE.gstQuarter;
  const b2b = billsOf(b)
    .filter((x) => x.status !== 'cancelled' && x.date >= '2026-07-01' && x.date <= '2026-09-30')
    .map((x) => ({ bill: x, c: customerOf(b, x.customer) }))
    .filter((p) => p.c?.gstin)
    .map((p) => ({
      number: p.bill.number,
      name: p.c!.name,
      gstin: p.c!.gstin!,
      totalPaise: p.bill.totalPaise,
      gstPaise: p.bill.gstPaise,
    }));
  return {
    period: { label: q.label, mode: 'quarter' },
    bills: q.bills,
    taxablePaise: q.taxablePaise,
    gstPaise: q.gstPaise,
    byRate: q.byRate,
    b2b,
    b2cBills: q.b2cBills,
  };
}
