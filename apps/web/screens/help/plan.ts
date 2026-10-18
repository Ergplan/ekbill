import {
  checkTerms,
  parseAmount,
  parseContractText,
  planMilestoneBill,
  planProgressBill,
  say,
  type BilledEntry,
  type ContractTerms,
  type ProjectBill,
  type Say,
  type TaxAt,
} from '@ekbill/engine';

import type { BillPrefill } from '../bill/prefill';

/**
 * "Mera bill thoda complex hai" (Stage 9; the MVP's contract helper, on
 * v2): the helper's answers as the salvaged engine's ContractTerms, and the
 * bill this one is (planMilestoneBill / planProgressBill). Nothing is
 * stored: the contract is typed (or pasted) each time and the result opens
 * the bill form with its line; the bill carries the working in its words.
 */
export type HelpKind = 'percent' | 'instalments' | 'running';

export interface HelpForm {
  kind: HelpKind;
  customer: string | null;
  name: string;
  total: string;
  gstMode: 'extra' | 'included' | 'none';
  /** Percent, from the rule pack's selectable rates. */
  gstRate: number | null;
  milestones: Array<{ label: string; pct: string }>;
  count: string;
  /** The instalment this bill is for (percent, instalments). */
  billIndex: number;
  /** The instalments already billed. */
  billed: boolean[];
  /** Running bill: the work done so far, in percent, and what was billed before. */
  donePct: string;
  before: string;
  retention: string;
}

export const PRESETS: Record<string, Array<{ label: string; pct: string }>> = {
  '50-50': [
    { label: 'Advance', pct: '50' },
    { label: 'On completion', pct: '50' },
  ],
  '30-40-30': [
    { label: 'Advance', pct: '30' },
    { label: 'On delivery', pct: '40' },
    { label: 'On installation', pct: '30' },
  ],
  '20-40-40': [
    { label: 'Advance', pct: '20' },
    { label: 'On delivery', pct: '40' },
    { label: 'On completion', pct: '40' },
  ],
};

export function emptyForm(kind: HelpKind, gstOn: boolean, defaultRate: number): HelpForm {
  return {
    kind,
    customer: null,
    name: '',
    total: '',
    gstMode: gstOn ? 'extra' : 'none',
    gstRate: gstOn ? defaultRate : null,
    milestones: PRESETS['30-40-30']!.map((m) => ({ ...m })),
    count: '3',
    billIndex: 0,
    billed: [],
    donePct: '',
    before: '',
    retention: '',
  };
}

const bp = (pct: string): number => Math.round(Number(pct.replace(',', '.').replace(/%/g, '').trim()) * 100);

/** The instalments: as typed (percent), or N equal ones (instalments; the engine makes the last one what is left). */
export function milestonesOf(f: HelpForm): Array<{ id: string; label: string; pctBp: number }> {
  if (f.kind === 'percent')
    return f.milestones.map((m, i) => ({ id: `m${i + 1}`, label: m.label, pctBp: m.pct.trim() ? bp(m.pct) : 0 }));
  if (f.kind === 'instalments') {
    const n = Math.max(0, Math.min(12, Math.trunc(Number(f.count))));
    if (!n) return [];
    const each = Math.floor(10000 / n);
    return Array.from({ length: n }, (_, i) => ({
      id: `m${i + 1}`,
      label: `Instalment ${i + 1}`,
      pctBp: i === n - 1 ? 10000 - each * (n - 1) : each,
    }));
  }
  return [];
}

export type Planned =
  { ok: false; field: string; message: Say } | { ok: true; terms: ContractTerms; bill: ProjectBill };

export function planFrom(
  f: HelpForm,
  opts: {
    chargesGst: boolean;
    allowedRates: readonly number[];
    at: TaxAt;
    /** The chosen customer's name: the job's name when none is typed (the walkthrough, 18 Oct). */
    customerName?: string | null;
  },
): Planned {
  if (!f.customer) return { ok: false, field: 'customer', message: say('help.ask.customer') };
  const totalPaise = parseAmount(f.total) ?? 0;
  const retentionBp = f.retention.trim() ? bp(f.retention) : 0;
  const checked = checkTerms(
    {
      name: f.name.trim() || (opts.customerName ?? '').trim(),
      totalPaise,
      gstMode: opts.chargesGst ? f.gstMode : 'none',
      gstRateBp: opts.chargesGst && f.gstMode !== 'none' && f.gstRate !== null ? f.gstRate * 100 : null,
      billing: f.kind === 'running' ? 'progress' : 'milestones',
      milestones: milestonesOf(f),
      retentionBp: Number.isFinite(retentionBp) ? retentionBp : -1,
    },
    // "GST nahi" on a registered business's contract is a choice of its own: no tax on these lines.
    {
      chargesGst: opts.chargesGst && f.gstMode !== 'none',
      allowedRatesBp: opts.allowedRates.map((r) => r * 100),
    },
  );
  if (!checked.ok) return { ok: false, field: checked.field, message: checked.message };
  const terms = checked.terms;
  if (f.kind === 'running') {
    const beforePaise = f.before.trim() ? (parseAmount(f.before) ?? -1) : 0;
    if (beforePaise < 0 || beforePaise > terms.totalPaise)
      return { ok: false, field: 'before', message: say('help.error.before') };
    const entries: BilledEntry[] = beforePaise
      ? [
          {
            documentId: 'before',
            number: null,
            milestoneId: null,
            basisPaise: beforePaise,
            cumulativeBp: null,
            status: 'issued',
          },
        ]
      : [];
    const planned = planProgressBill(terms, f.donePct.trim() ? bp(f.donePct) : 0, entries, opts.at);
    return planned.ok
      ? { ok: true, terms, bill: planned.bill }
      : { ok: false, field: 'donePct', message: planned.message };
  }
  const entries: BilledEntry[] = terms.milestones.flatMap((m, i) =>
    f.billed[i]
      ? [
          {
            documentId: m.id,
            number: `#${i + 1}`,
            milestoneId: m.id,
            basisPaise: Math.round((terms.totalPaise * m.pctBp) / 10000),
            cumulativeBp: null,
            status: 'issued' as const,
          },
        ]
      : [],
  );
  const target = terms.milestones[f.billIndex];
  if (!target) return { ok: false, field: 'billIndex', message: say('help.ask.which') };
  const planned = planMilestoneBill(terms, target.id, entries, opts.at);
  return planned.ok
    ? { ok: true, terms, bill: planned.bill }
    : { ok: false, field: 'billIndex', message: planned.message };
}

/** What the bill form opens with: one line, the contract's GST. */
export function prefillOf(p: Extract<Planned, { ok: true }>): BillPrefill {
  return {
    lines: [{ what: p.bill.description, qty: '1', rate: (p.bill.linePaise / 100).toFixed(2).replace(/\.00$/, '') }],
    gstRate: p.terms.gstMode === 'none' ? null : (p.terms.gstRateBp ?? 0) / 100,
    gstOn: p.terms.gstMode !== 'none',
  };
}

/** The helper's fields from a pasted contract (the engine's literal reading); what it cannot find stays as it was. */
/** The one known customer the text names (the longest name found, when only one is that long; never a short one). */
export function customerNamed(text: string, known: ReadonlyArray<{ id: string; name: string }>): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const hay = ` ${norm(text)
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')} `;
  const hits = known
    .map((c) => ({
      id: c.id,
      name: norm(c.name)
        .replace(/[^\p{L}\p{N} ]+/gu, ' ')
        .replace(/\s+/g, ' '),
    }))
    .filter((c) => c.name.length >= 4 && hay.includes(` ${c.name} `));
  if (!hits.length) return null;
  const longest = Math.max(...hits.map((h) => h.name.length));
  const top = hits.filter((h) => h.name.length === longest);
  return top.length === 1 ? top[0]!.id : null;
}

export function fromText(
  f: HelpForm,
  text: string,
  allowedRates: readonly number[],
  /** The business's customers: one the text names is chosen, unless one is already chosen. */
  known: ReadonlyArray<{ id: string; name: string }> = [],
): { form: HelpForm; found: number } {
  const p = parseContractText(
    text,
    allowedRates.map((r) => r * 100),
  );
  let found = 0;
  const next: HelpForm = { ...f };
  const take = (ok: unknown, apply: () => void) => {
    if (!ok) return;
    apply();
    found += 1;
  };
  const named = f.customer ? null : customerNamed(text, known);
  take(named, () => (next.customer = named));
  take(p.name, () => (next.name = p.name!));
  take(p.totalPaise, () => (next.total = String(p.totalPaise! / 100)));
  take(p.gstMode, () => (next.gstMode = p.gstMode!));
  take(p.gstRateBp, () => (next.gstRate = p.gstRateBp! / 100));
  take(p.retentionBp !== null, () => (next.retention = String(p.retentionBp! / 100)));
  if (p.billing === 'milestones' && p.milestones.length) {
    next.kind = 'percent';
    next.milestones = p.milestones.map((m) => ({ label: m.label, pct: String(m.pctBp / 100) }));
    next.billed = [];
    next.billIndex = 0;
    found += 1;
  } else if (p.billing === 'progress') {
    next.kind = 'running';
    found += 1;
  }
  return { form: next, found };
}
