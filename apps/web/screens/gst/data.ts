import { computeTax } from '@ekbill/engine';

import { FIXTURE } from '../fixtures';
import { billsOf, customerOf } from '../common';
import type { Viewer } from '../viewer';

export interface GstData {
  period: { label: string; mode: 'month' | 'quarter' };
  bills: number;
  taxablePaise: number;
  gstPaise: number;
  byRate: Array<{ rate: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number }>;
  b2b: Array<{ number: string; name: string; gstin: string; totalPaise: number; gstPaise: number }>;
  b2cBills: number;
}

/**
 * The quarter's workings, computed by the engine over the period's bills
 * (I4): the fixture carries only the period label. Cancelled bills are
 * left out; a bill without a tax-invoice kind contributes no tax.
 */
export function loadGst(viewer: Viewer): GstData | null {
  const b = viewer.business;
  if (!b || b.registration !== 'regular') return null;
  const q = FIXTURE.gstQuarter;
  const bills = billsOf(b)
    .filter((x) => x.status !== 'cancelled' && x.date >= q.from && x.date <= q.to)
    .map((bill) => {
      const customer = customerOf(b, bill.customer);
      const tax = computeTax({
        lines: bill.lines.map((l) => ({
          description: l.what,
          quantityMilli: Math.round(l.qty * 1000),
          unitPricePaise: l.ratePaise,
          gstBp: (l.gstRate ?? 0) * 100,
        })),
        registration: b.registration,
        gstOn: bill.kind === 'tax-invoice',
        dateIso: bill.date,
        sellerStateCode: b.stateCode,
        customerStateCode: customer?.stateCode ?? null,
      });
      return { bill, customer, tax };
    });
  const byRate = new Map<number, GstData['byRate'][number]>();
  for (const { tax } of bills) {
    for (const l of tax.lines) {
      if (l.blank || !l.gstBp) continue;
      const rate = l.gstBp / 100;
      const row = byRate.get(rate) ?? { rate, taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 };
      row.taxablePaise += l.taxablePaise;
      row.cgstPaise += l.cgstPaise;
      row.sgstPaise += l.statePaise;
      row.igstPaise += l.igstPaise;
      byRate.set(rate, row);
    }
  }
  const b2b = bills
    .filter((p) => p.customer?.gstin)
    .map((p) => ({
      number: p.bill.number,
      name: p.customer!.name,
      gstin: p.customer!.gstin!,
      totalPaise: p.tax.totalPaise,
      gstPaise: p.tax.gstPaise,
    }));
  return {
    period: { label: q.label, mode: 'quarter' },
    bills: bills.length,
    taxablePaise: bills.reduce((a, p) => a + p.tax.subtotalPaise, 0),
    gstPaise: bills.reduce((a, p) => a + p.tax.gstPaise, 0),
    byRate: [...byRate.values()].sort((a, b) => a.rate - b.rate),
    b2b,
    b2cBills: bills.length - b2b.length,
  };
}
