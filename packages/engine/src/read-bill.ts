import { addDays, compareDates, type CivilDate } from './dates';
import { parseMoney, parseQuantity } from './money';
import { nameKey } from './names';
import { toE164 } from './phone';
import { computeTax } from './tax';
import type { Registration } from './rules';

/**
 * A photographed bill, as read (Stage 7). The model reads; the engine
 * checks: numbers must parse, quantity × rate should be the line's amount,
 * the date must be plausible, the customer is matched with a score, and the
 * total is computed by computeTax, never taken from the image (I4). The
 * result is staging (I6): the owner reviews it before anything is made.
 */
export interface ReadField {
  value: string | null;
  /** 0–1, as the model put it; the screen colours ≥ 0.85 green, ≥ 0.6 amber, else red. */
  confidence: number;
  unreadable?: boolean;
}
export interface ReadLine {
  what: ReadField;
  qty: ReadField;
  unit?: ReadField;
  rate: ReadField;
  amount: ReadField;
  hsn?: ReadField;
}
/** The model's answer, after its schema check (packages/ai). */
export interface BillReading {
  /** False when the photo is too blurred, dark or cut to read. */
  legible: boolean;
  /** False when the photo holds no bill (a menu, a selfie, a blank page). */
  found: boolean;
  customer: ReadField;
  phone?: ReadField;
  date: ReadField;
  lines: ReadLine[];
  total: ReadField;
  notes?: string | null;
}

export interface ReadingWarning {
  code: 'line-amount' | 'rate-derived' | 'number' | 'date-implausible' | 'total-differs' | 'customer-new';
  path: string;
  params?: Record<string, string | number>;
}
export interface ReadingLine {
  what: ReadField;
  qty: ReadField;
  unit: ReadField;
  rate: ReadField;
  amount: ReadField;
  hsn: ReadField;
}
export interface CheckedReading {
  outcome: 'ready' | 'unreadable' | 'no-bill';
  customer: ReadField;
  phone: ReadField;
  /** ISO (YYYY-MM-DD) when the date read is plausible; else null and lit. */
  date: ReadField;
  lines: ReadingLine[];
  /** What the photo says the total is, if it says. */
  imageTotalPaise: number | null;
  /** What the lines add up to, by the engine (no GST: a kaccha bill's lines are what was charged). */
  linesTotalPaise: number;
  totalsDiffer: boolean;
  warnings: ReadingWarning[];
  match: { customerId: string; name: string; score: number } | null;
  notes: string | null;
}

export interface ReadingContext {
  today: CivilDate;
  customers: ReadonlyArray<{ id: string; name: string; phone?: string | null }>;
  registration: Registration;
  sellerStateCode: string | null;
}

const EMPTY: ReadField = { value: null, confidence: 0, unreadable: true };

function clean(f: ReadField | undefined): ReadField {
  if (!f) return { ...EMPTY };
  const confidence = Number.isFinite(f.confidence) ? Math.min(1, Math.max(0, f.confidence)) : 0;
  const value = typeof f.value === 'string' ? f.value.replace(/\s+/g, ' ').trim() : null;
  if (f.unreadable || !value) return { value: null, confidence: f.unreadable ? 0 : confidence, unreadable: true };
  return { value, confidence };
}

/** "₹1,500/-", "Rs. 1500", "1500.00" → "1500" (as the form takes it); null when it is not a number. */
export function looseAmount(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw
    .replace(/₹|rs\.?|inr|\/-|=|\s/gi, '')
    .replace(/,/g, '')
    .replace(/\.$/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return s.replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1');
}
/** "2", "2 pcs", "1.5 kg" → { qty: "2", unit: "pcs" }. */
export function looseQuantity(raw: string | null): { qty: string; unit: string | null } | null {
  if (!raw) return null;
  const m = /^\s*(\d+(?:\.\d{1,3})?)\s*([a-zA-Z.]{1,8})?\s*$/.exec(raw.replace(/,/g, ''));
  if (!m) return null;
  return { qty: m[1]!.replace(/\.0+$/, ''), unit: m[2]?.replace(/\.$/, '').toLowerCase() ?? null };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');
function validDate(y: number, m: number, d: number): CivilDate | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
/**
 * The date as Indian bills write it: 12/10/26, 12-10-2026, 12.10.2026,
 * 12 Oct 2026, 12 Oct (the latest one not after today), 2026-10-12. Day first, always.
 */
export function looseDate(raw: string | null, today: CivilDate): CivilDate | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validDate(y, Number(m[2]), Number(m[1]));
  }
  m = /^(\d{1,2})(?:st|nd|rd|th)?[\s-]*([a-z]{3})[a-z]*[\s,-]*(\d{2}|\d{4})?$/.exec(s);
  if (m) {
    const month = MONTHS.indexOf(m[2]!) + 1;
    if (!month) return null;
    if (m[3]) return validDate(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), month, Number(m[1]));
    // No year: the latest such day not after today (a bill read on 5 January that says "28 Dec" is last December's).
    const thisYear = validDate(Number(today.slice(0, 4)), month, Number(m[1]));
    if (thisYear && compareDates(thisYear, today) <= 0) return thisYear;
    return validDate(Number(today.slice(0, 4)) - 1, month, Number(m[1])) ?? thisYear;
  }
  return null;
}

/** Name likeness, 0–1: the Dice coefficient over letter pairs, after dropping case, punctuation and "ji"/"m/s". */
export function nameLikeness(a: string, b: string): number {
  const norm = (s: string) => nameKey(s.toLowerCase().replace(/\bm\/s\.?|\bji\b|\bshri\b|\bsmt\.?/g, ' '));
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const pairs = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i += 1) out.set(s.slice(i, i + 2), (out.get(s.slice(i, i + 2)) ?? 0) + 1);
    return out;
  };
  const px = pairs(x);
  const py = pairs(y);
  let both = 0;
  for (const [k, n] of px) both += Math.min(n, py.get(k) ?? 0);
  const total = Math.max(1, x.length - 1 + y.length - 1);
  // One name inside the other ("Mehta" in "Mehta Traders") counts as most of a match.
  const inside = x.includes(y) || y.includes(x) ? 0.85 : 0;
  return Math.max(inside, (2 * both) / total);
}

export function checkReading(reading: BillReading, ctx: ReadingContext): CheckedReading {
  const warnings: ReadingWarning[] = [];
  const customer = clean(reading.customer);
  const phone = clean(reading.phone);
  const notes = reading.notes?.trim() || null;
  const base = {
    customer,
    phone,
    date: { ...EMPTY },
    lines: [] as ReadingLine[],
    imageTotalPaise: null,
    linesTotalPaise: 0,
    totalsDiffer: false,
    warnings,
    match: null,
    notes,
  };
  if (!reading.legible) return { ...base, outcome: 'unreadable' };

  // The lines: numbers parse, quantity × rate against the amount, a missing rate from the amount.
  const lines: ReadingLine[] = [];
  for (const [i, raw] of reading.lines.entries()) {
    const what = clean(raw.what);
    const qtyField = clean(raw.qty);
    const rateField = clean(raw.rate);
    const amountField = clean(raw.amount);
    const q = looseQuantity(qtyField.value);
    const unitRead = clean(raw.unit);
    let qty: ReadField = q ? { value: q.qty, confidence: qtyField.confidence } : { ...qtyField };
    if (!q && qtyField.value) {
      warnings.push({ code: 'number', path: `lines.${i}.qty` });
      qty = { value: null, confidence: 0, unreadable: true };
    }
    if (!qtyField.value && !qtyField.unreadable) qty = { value: '1', confidence: 0.5 };
    const unit: ReadField = unitRead.value
      ? unitRead
      : q?.unit
        ? { value: q.unit, confidence: qtyField.confidence }
        : { value: null, confidence: 1 };
    const rateText = looseAmount(rateField.value);
    const amountText = looseAmount(amountField.value);
    let rate: ReadField = rateText ? { value: rateText, confidence: rateField.confidence } : { ...rateField };
    const amount: ReadField = amountText
      ? { value: amountText, confidence: amountField.confidence }
      : { ...amountField };
    if (rateField.value && !rateText) {
      warnings.push({ code: 'number', path: `lines.${i}.rate` });
      rate = { value: null, confidence: 0, unreadable: true };
    }
    if (amountField.value && !amountText) warnings.push({ code: 'number', path: `lines.${i}.amount` });
    const qtyMilli = qty.value ? parseQuantity(qty.value) : null;
    const ratePaise = rate.value ? parseMoney(rate.value) : null;
    const amountPaise = amount.value && amountText ? parseMoney(amount.value) : null;
    if (ratePaise === null && amountPaise !== null && qtyMilli) {
      const derived = Math.round((amountPaise * 1000) / qtyMilli);
      rate = { value: (derived / 100).toFixed(2).replace(/\.00$/, ''), confidence: Math.min(amount.confidence, 0.7) };
      warnings.push({ code: 'rate-derived', path: `lines.${i}.rate` });
    } else if (ratePaise !== null && amountPaise !== null && qtyMilli) {
      const expected = Math.round((qtyMilli * ratePaise) / 1000);
      if (Math.abs(expected - amountPaise) > Math.max(100, Math.round(amountPaise / 100)))
        warnings.push({ code: 'line-amount', path: `lines.${i}.amount`, params: { expected, read: amountPaise } });
    }
    if (!what.value && !rate.value && !amount.value) continue;
    lines.push({ what, qty, unit, rate, amount, hsn: clean(raw.hsn) });
  }
  if (!reading.found || !lines.some((l) => l.what.value || l.rate.value)) return { ...base, outcome: 'no-bill', lines };

  // The date: as written, day first; plausible means within the last year and not tomorrow.
  const dateRead = clean(reading.date);
  let date: ReadField = { ...dateRead };
  if (dateRead.value) {
    const iso = looseDate(dateRead.value, ctx.today);
    if (!iso || compareDates(iso, ctx.today) > 0 || compareDates(iso, addDays(ctx.today, -366)) < 0) {
      warnings.push({ code: 'date-implausible', path: 'date', params: { read: dateRead.value } });
      date = { value: null, confidence: 0, unreadable: true };
    } else date = { value: iso, confidence: dateRead.confidence };
  }

  // The total: the engine's sum of the lines (I4); the image's figure is only compared.
  const linesTotalPaise = computeTax({
    lines: lines.map((l) => ({
      description: l.what.value ?? '',
      quantityMilli: l.qty.value ? parseQuantity(l.qty.value) : 1000,
      unitPricePaise: l.rate.value ? parseMoney(l.rate.value) : 0,
      gstBp: 0,
    })),
    registration: ctx.registration,
    gstOn: false,
    dateIso: date.value ?? ctx.today,
    sellerStateCode: ctx.sellerStateCode,
    customerStateCode: ctx.sellerStateCode,
  }).totalPaise;
  const totalText = looseAmount(clean(reading.total).value);
  const imageTotalPaise = totalText ? parseMoney(totalText) : null;
  const totalsDiffer = imageTotalPaise !== null && imageTotalPaise !== linesTotalPaise;
  if (totalsDiffer)
    warnings.push({ code: 'total-differs', path: 'total', params: { read: imageTotalPaise!, lines: linesTotalPaise } });

  // The customer: a phone that matches is certain; else the likeliest name above 0.6.
  let match: CheckedReading['match'] = null;
  const e164 = toE164(phone.value);
  const byPhone = e164 ? ctx.customers.find((c) => c.phone && toE164(c.phone) === e164) : undefined;
  if (byPhone) match = { customerId: byPhone.id, name: byPhone.name, score: 1 };
  else if (customer.value) {
    const scored = ctx.customers
      .map((c) => ({ customerId: c.id, name: c.name, score: nameLikeness(customer.value!, c.name) }))
      .sort((a, b) => b.score - a.score)[0];
    if (scored && scored.score >= 0.6) match = { ...scored, score: Math.round(scored.score * 100) / 100 };
  }
  if (!match && customer.value) warnings.push({ code: 'customer-new', path: 'customer' });

  return {
    ...base,
    outcome: 'ready',
    date,
    lines,
    imageTotalPaise,
    linesTotalPaise,
    totalsDiffer,
    match,
  };
}
