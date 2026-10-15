import { applyBasisPoints, lineGross, parseMoney, parseQuantity } from '@ekbill/engine';
import type { LineValue } from '@ekbill/ui';

/** The draft the form keeps in sessionStorage; Stage 6's server action takes the same shape. */
export interface GstChoice {
  on: boolean;
  mode: 'one' | 'perline';
  rate: number;
  perLine: number[];
}
export interface BillDraft {
  customer: string | null;
  customerName: string;
  customerState: string | null;
  lines: LineValue[];
  gst: GstChoice;
  series: string;
  number: string;
  date: string;
}
export interface ComputedLine {
  what: string;
  qty: string;
  amountPaise: number;
  ratePaise: number;
  gstRate: number;
  gstPaise: number;
}
export interface Computed {
  lines: ComputedLine[];
  subtotalPaise: number;
  gstPaise: number;
  totalPaise: number;
}

function safe<T>(f: () => T, fallback: T): T {
  try {
    return f();
  } catch {
    return fallback;
  }
}

/** Integer paise throughout (engine money); an unparsable field counts as zero, never NaN. */
export function compute(draft: Pick<BillDraft, 'lines' | 'gst'>, registration: string | null): Computed {
  const taxed = draft.gst.on && registration === 'regular';
  const lines = draft.lines.map((l, i) => {
    const qtyMilli = safe(() => parseQuantity(l.qty), 0);
    const ratePaise = safe(() => parseMoney(l.rate), 0);
    const amountPaise = lineGross(qtyMilli, ratePaise);
    const gstRate = taxed
      ? draft.gst.mode === 'perline'
        ? (draft.gst.perLine[i] ?? draft.gst.rate)
        : draft.gst.rate
      : 0;
    return {
      what: l.what,
      qty: l.qty,
      ratePaise,
      amountPaise,
      gstRate,
      gstPaise: applyBasisPoints(amountPaise, gstRate * 100),
    };
  });
  const subtotalPaise = lines.reduce((s, l) => s + l.amountPaise, 0);
  const gstPaise = lines.reduce((s, l) => s + l.gstPaise, 0);
  return { lines, subtotalPaise, gstPaise, totalPaise: subtotalPaise + gstPaise };
}

/** CGST/SGST at half each within the state, IGST across states (Stage 3 verifies against the rule pack). */
export function taxLines(
  c: Computed,
  sellerState: string | null,
  customerState: string | null,
): Array<{ label: string; paise: number }> {
  if (!c.gstPaise) return [];
  const rates = [...new Set(c.lines.filter((l) => l.gstPaise).map((l) => l.gstRate))];
  const label = rates.length === 1 ? `${rates[0]}%` : 'mixed';
  if (customerState && sellerState && customerState !== sellerState)
    return [{ label: `IGST ${label}`, paise: c.gstPaise }];
  const half = Math.round(c.gstPaise / 2);
  return [
    { label: `CGST ${rates.length === 1 ? `${(rates[0] ?? 0) / 2}%` : ''}`.trim(), paise: half },
    { label: `SGST ${rates.length === 1 ? `${(rates[0] ?? 0) / 2}%` : ''}`.trim(), paise: c.gstPaise - half },
  ];
}
