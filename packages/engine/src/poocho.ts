import { moneyForMessage, pctText } from './contract';
import { financialYearOf, formatDateShort, type CivilDate } from './dates';

/**
 * "Poocho" (Stage 9; salvaged from the MVP's src/lib/search/documents.ts):
 * what the owner can ask about, as text. A bill, a customer or an item is
 * turned into a few plain sentences that carry the words an owner would use
 * to ask about it: the customer's name, what was done, the rate, the date,
 * what is still owed. Those sentences are what gets searched and what the
 * answer is written from, so they say only what the record says. Phone
 * numbers, GSTINs and bank details are never in them.
 *
 * Pure: tested without a database or a model.
 */
/**
 * Free text an owner typed (a note, a description, a cancel reason) can carry a phone, a GSTIN or a bank account;
 * the records go to the model and into the index, so those are taken out (Stage 9 review). What is left still
 * reads: "ph [hidden]".
 */
export function redact(text: string): string {
  return text
    .replace(/\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/gi, '[hidden]')
    .replace(/\b[A-Z]{4}0[A-Z0-9]{6}\b/gi, '[hidden]')
    .replace(/(?:\+?91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/g, '[hidden]')
    .replace(/\b\d(?:[\s-]?\d){8,17}\b/g, '[hidden]');
}

export type RecordKind = 'bill' | 'customer' | 'item';

export interface SearchRecord {
  kind: RecordKind;
  sourceId: string;
  title: string;
  text: string;
  /** Where the owner goes to see it. */
  href: string;
}

const qty = (milli: number) => {
  const s = (milli / 1000).toFixed(3).replace(/\.?0+$/, '');
  return s || '0';
};

export interface BillForSearch {
  id: string;
  number: string;
  kind: 'tax_invoice' | 'bill_of_supply' | 'credit_note';
  status: 'issued' | 'cancelled';
  dateIso: CivilDate;
  dueDate: CivilDate | null;
  customerName: string;
  customerCity: string | null;
  lines: ReadonlyArray<{ description: string; quantityMilli: number; unitPricePaise: number; gstBp: number }>;
  subtotalPaise: number;
  gstPaise: number;
  totalPaise: number;
  cancelledReason: string | null;
  notes: string | null;
  /** Against which bill (a credit note). */
  linkedNumber: string | null;
  paidPaise: number;
  duePaise: number;
  payments: ReadonlyArray<{ date: CivilDate; amountPaise: number; method: string | null }>;
  creditNotes: ReadonlyArray<{ number: string; totalPaise: number }>;
}

export function billRecord(b: BillForSearch): SearchRecord {
  const note = b.kind === 'credit_note';
  const lines = b.lines
    .filter((l) => l.description.trim() || l.unitPricePaise)
    .map((l) => {
      const amount = Math.round((l.quantityMilli * l.unitPricePaise) / 1000);
      const rate = l.gstBp ? `, GST ${pctText(l.gstBp)}%` : '';
      return `${redact(l.description.trim()) || 'Item'}: ${qty(l.quantityMilli)} x ${moneyForMessage(l.unitPricePaise)} = ${moneyForMessage(amount)}${rate}`;
    });
  const parts = [
    note
      ? `Credit note ${b.number} dated ${formatDateShort(b.dateIso)} to ${b.customerName}${b.linkedNumber ? `, against bill ${b.linkedNumber}` : ''}.`
      : `Bill ${b.number} dated ${formatDateShort(b.dateIso)} to ${b.customerName}${b.customerCity ? ` (${b.customerCity})` : ''}.`,
    lines.length ? `Items: ${lines.join('; ')}.` : '',
    b.gstPaise ? `Before GST ${moneyForMessage(b.subtotalPaise)}, GST ${moneyForMessage(b.gstPaise)}.` : '',
    `Total ${moneyForMessage(b.totalPaise)}.`,
  ];
  if (b.status === 'cancelled') {
    parts.push(
      `This ${note ? 'credit note' : 'bill'} was cancelled${b.cancelledReason ? ` (${redact(b.cancelledReason)})` : ''}.`,
    );
  } else if (!note) {
    for (const p of b.payments)
      parts.push(
        `Received ${moneyForMessage(p.amountPaise)} on ${formatDateShort(p.date)}${p.method ? ` by ${p.method.toUpperCase()}` : ''}.`,
      );
    if (!b.payments.length) parts.push('Nothing received yet.');
    for (const c of b.creditNotes)
      parts.push(`Credit note ${c.number} for ${moneyForMessage(c.totalPaise)} against it.`);
    parts.push(
      b.duePaise > 0
        ? `Still to come: ${moneyForMessage(b.duePaise)}${b.dueDate ? `, due ${formatDateShort(b.dueDate)}` : ''}.`
        : 'Fully settled.',
    );
  }
  if (b.notes?.trim()) parts.push(`Note on the bill: ${redact(b.notes.trim()).slice(0, 300)}`);
  return {
    kind: 'bill',
    sourceId: b.id,
    title: `${note ? 'Credit note' : 'Bill'} ${b.number} · ${b.customerName}`,
    text: parts.filter(Boolean).join(' '),
    // One path segment (a number with the year in it carries a slash), and the year it belongs to (a series without
    // the year in its numbers starts again each April).
    href: `/bills/${encodeURIComponent(b.number)}?fy=${financialYearOf(b.dateIso)}`,
  };
}

export interface CustomerForSearch {
  id: string;
  name: string;
  contactPerson: string | null;
  city: string | null;
  stateName: string | null;
  lastBilledAt: CivilDate | null;
  notes: string | null;
}

export function customerRecord(c: CustomerForSearch): SearchRecord {
  return {
    kind: 'customer',
    sourceId: c.id,
    title: `Customer · ${c.name}`,
    text: [
      `Customer ${c.name}${c.contactPerson ? `, contact ${c.contactPerson}` : ''}${c.city ? `, ${c.city}` : ''}${c.stateName ? ` (${c.stateName})` : ''}.`,
      c.lastBilledAt ? `Last billed on ${formatDateShort(c.lastBilledAt)}.` : 'Not billed yet.',
      c.notes?.trim() ? `Note: ${redact(c.notes.trim()).slice(0, 300)}` : '',
    ]
      .filter(Boolean)
      .join(' '),
    href: `/customers/${c.id}`,
  };
}

export interface ItemForSearch {
  id: string;
  name: string;
  description: string | null;
  hsnSac: string | null;
  unit: string | null;
  defaultRatePaise: number | null;
  defaultTaxBp: number | null;
}

export function itemRecord(i: ItemForSearch): SearchRecord {
  return {
    kind: 'item',
    sourceId: i.id,
    title: `Item · ${i.name}`,
    text: [
      `Item ${i.name}${i.description ? `: ${redact(i.description)}` : ''}.`,
      i.defaultRatePaise !== null
        ? `Usual rate ${moneyForMessage(i.defaultRatePaise)}${i.unit ? ` per ${i.unit}` : ''}.`
        : 'No usual rate.',
      i.defaultTaxBp !== null ? `GST ${pctText(i.defaultTaxBp)}%.` : '',
      i.hsnSac ? `HSN/SAC ${i.hsnSac}.` : '',
    ]
      .filter(Boolean)
      .join(' '),
    href: `/items/${i.id}`,
  };
}

/**
 * Words that carry no meaning in a question: Hinglish glue and English
 * question words. Left in, an OR search matches every record on "ka".
 */
const STOP = new Set(
  (
    'ka ki ke ko se me mein mai main hai hain tha thi the kya kab kaun kaunsa kitna kitne kitni kaise kyun ' +
    'aur ya bhi to toh ho hua hui kar karo kiya diya liya de do di pe par wala wali wale sab koi kuch ek ' +
    'ji sahab bhai mera meri mere mujhe maine humne hum aap apna apne apni un unka unki unke is us yeh woh ' +
    'a an and or of to in on for is was were what when who how much many did do does my me i with ' +
    'bill bills baar last pichli pichle batao bata dikhao'
  ).split(/\s+/),
);

/** The meaningful words of a question, lower-case, each once (at most twelve). */
export function questionWords(question: string): string[] {
  const words = question
    .toLowerCase()
    .normalize('NFKC')
    // Letters, their vowel signs (Devanagari and Tamil words are letters and marks), digits.
    .replace(/[^\p{L}\p{M}\p{N}\s/-]/gu, ' ')
    .split(/[\s/-]+/)
    .filter((w) => w.length >= 2 && !STOP.has(w))
    .slice(0, 12);
  return [...new Set(words)];
}

/**
 * A Postgres tsquery ('simple' dictionary) for a question: its meaningful
 * words, each as a prefix, any of them. Null when nothing meaningful is left.
 */
export function tsQueryFor(question: string): string | null {
  const words = questionWords(question)
    .map((w) => w.replace(/[':&|!()\\]/g, ''))
    .filter(Boolean);
  if (!words.length) return null;
  return words.map((w) => `${w}:*`).join(' | ');
}

/**
 * Reciprocal rank fusion: combine the word search and the meaning search so
 * a record either one ranks high comes out near the top.
 */
export function fuseRanks<T extends string>(lists: readonly (readonly T[])[], k = 60): T[] {
  const score = new Map<T, number>();
  for (const list of lists) list.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 1 / (k + i + 1)));
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/** The records as the model reads them: numbered, each with its title. */
export function recordsMessage(question: string, records: ReadonlyArray<{ title: string; text: string }>): string {
  const body = records.map((r, i) => `[${i + 1}] ${r.title}\n${r.text.slice(0, 1500)}`).join('\n\n');
  return `<records>\n${body}\n</records>\n\nQuestion: ${question.trim().slice(0, 500)}`;
}

/** The record numbers an answer cites, in order, each once, only ones that exist. */
export function citationsIn(answer: string, count: number): number[] {
  const seen: number[] = [];
  for (const m of answer.matchAll(/\[(\d{1,2})\]/g)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= count && !seen.includes(n)) seen.push(n);
  }
  return seen;
}

/** The answer with its citations renumbered to the list shown under it (uncited records are not shown). */
export function renumberCitations(answer: string, cited: readonly number[]): string {
  return answer
    .replace(/\[(\d{1,2})\]/g, (_m, n: string) => {
      const at = cited.indexOf(Number(n));
      return at >= 0 ? `[${at + 1}]` : '';
    })
    .replace(/ {2,}/g, ' ')
    .replace(/\s+([.,])/g, '$1')
    .trim();
}
