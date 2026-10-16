import { addMonthsToPeriod, gstQuarterOf, type CivilDate, type MonthPeriod } from './dates';
import type { IssuedSnapshot } from './issue';
import { GST_RULES, thresholdOn, type RulePack } from './rules';

/**
 * GSTR-1 and GSTR-3B (outward) workings, from issued snapshots only (I2).
 * Salvaged from the MVP's src/lib/gst-returns/workings.ts and qrmp.ts (tag
 * mvp-final). Two rules govern everything here: every figure drills down
 * to the documents behind it (a number the owner cannot trace is a number
 * they cannot check), and the same period renders the same way every time
 * it is opened, whatever order the documents arrived in. The purchase side
 * (ITC, reconciliation, readiness) is Stage 8.
 */
export interface SnapshotDocument {
  id: string;
  number: string;
  status: 'issued' | 'cancelled';
  snapshot: IssuedSnapshot;
}
export interface OutwardDocument {
  /** `${documentId}__${gstBp}`: one per document per rate. */
  id: string;
  sourceDocumentId: string;
  documentNumber: string;
  documentDate: CivilDate;
  documentType: 'invoice' | 'credit-note';
  customerGstin: string | null;
  customerName: string;
  placeOfSupplyStateCode: string | null;
  isInterState: boolean;
  /** The document's full value including tax: what decides B2C large. */
  invoiceValuePaise: number;
  gstBp: number;
  taxablePaise: number;
  cgstPaise: number;
  statePaise: number;
  igstPaise: number;
  cessPaise: number;
  /** For a credit note: the invoice it corrects, with that invoice's value when known (B2CL notes go to CDNUR). */
  linkedInvoice?: { number: string; dateIso: CivilDate; valuePaise: number | null } | null;
  hsnLines: Array<{
    hsnCode: string | null;
    description: string;
    quantityMilli: number;
    unit: string | null;
    taxablePaise: number;
    gstBp: number;
    cgstPaise: number;
    statePaise: number;
    igstPaise: number;
    cessPaise: number;
  }>;
}

/** Turn issued documents into outward documents, one per rate. Drafts never reach here; cancelled ones are reported, never counted. */
export function outwardDocumentsFromSnapshots(
  documents: readonly SnapshotDocument[],
  /** The value of each invoice a credit note links to, by document id (the invoice may lie outside the period). */
  invoiceValues: ReadonlyMap<string, number> = new Map(),
): OutwardDocument[] {
  const out: OutwardDocument[] = [];
  for (const d of documents) {
    if (d.status !== 'issued') continue;
    const s = d.snapshot;
    const byRate = new Map<number, OutwardDocument['hsnLines']>();
    for (const l of s.lines) {
      if (l.blank) continue;
      const entry = {
        hsnCode: l.hsnCode,
        description: l.description,
        quantityMilli: l.quantityMilli,
        unit: l.unit,
        taxablePaise: l.taxablePaise,
        gstBp: l.gstBp,
        cgstPaise: l.cgstPaise,
        statePaise: l.statePaise,
        igstPaise: l.igstPaise,
        cessPaise: l.cessPaise,
      };
      byRate.set(l.gstBp, [...(byRate.get(l.gstBp) ?? []), entry]);
    }
    for (const [gstBp, lines] of byRate) {
      out.push({
        id: `${d.id}__${gstBp}`,
        sourceDocumentId: d.id,
        documentNumber: d.number,
        documentDate: s.dateIso,
        documentType: s.kind === 'credit-note' ? 'credit-note' : 'invoice',
        customerGstin: s.customer.gstin,
        customerName: s.customer.name,
        placeOfSupplyStateCode: s.placeOfSupplyStateCode,
        isInterState: s.supply === 'inter',
        invoiceValuePaise: s.totals.totalPaise,
        gstBp,
        taxablePaise: lines.reduce((n, l) => n + l.taxablePaise, 0),
        cgstPaise: lines.reduce((n, l) => n + l.cgstPaise, 0),
        statePaise: lines.reduce((n, l) => n + l.statePaise, 0),
        igstPaise: lines.reduce((n, l) => n + l.igstPaise, 0),
        cessPaise: lines.reduce((n, l) => n + l.cessPaise, 0),
        linkedInvoice:
          s.kind === 'credit-note' && s.linkedInvoice
            ? {
                number: s.linkedInvoice.number,
                dateIso: s.linkedInvoice.dateIso,
                valuePaise: invoiceValues.get(s.linkedInvoice.id) ?? null,
              }
            : null,
        hsnLines: lines,
      });
    }
  }
  return out;
}

/** The documents dated inside a month period, or inside a quarter's three months. */
export function inPeriod<T extends { documentDate: CivilDate }>(
  documents: readonly T[],
  periods: readonly MonthPeriod[],
): T[] {
  const set = new Set(periods);
  return documents.filter((d) => set.has(d.documentDate.slice(0, 7)));
}

interface Heads {
  taxablePaise: number;
  cgstPaise: number;
  statePaise: number;
  igstPaise: number;
  cessPaise: number;
}
const zero = (): Heads => ({ taxablePaise: 0, cgstPaise: 0, statePaise: 0, igstPaise: 0, cessPaise: 0 });
const add = (a: Heads, d: Heads, sign = 1) => {
  a.taxablePaise += sign * d.taxablePaise;
  a.cgstPaise += sign * d.cgstPaise;
  a.statePaise += sign * d.statePaise;
  a.igstPaise += sign * d.igstPaise;
  a.cessPaise += sign * d.cessPaise;
};

export interface Gstr1Tables {
  period: MonthPeriod;
  periods: MonthPeriod[];
  /** Table 4: supplies to registered persons, by customer GSTIN and document. */
  b2b: Array<{
    customerGstin: string;
    customerName: string;
    documents: Array<{
      documentNumber: string;
      documentDate: CivilDate;
      placeOfSupplyStateCode: string | null;
      invoiceValuePaise: number;
      lines: Array<Heads & { gstBp: number }>;
      sourceIds: string[];
      sourceDocumentId: string;
    }>;
  }>;
  /** Table 5: inter-State supplies to unregistered persons above the pack's threshold, document by document. */
  b2cLarge: Array<{
    documentNumber: string;
    documentDate: CivilDate;
    placeOfSupplyStateCode: string | null;
    invoiceValuePaise: number;
    lines: Array<Heads & { gstBp: number }>;
    sourceIds: string[];
    sourceDocumentId: string;
  }>;
  /** Table 7: the rest of the supplies to unregistered persons, by place of supply and rate. */
  b2cSmall: Array<
    Heads & {
      placeOfSupplyStateCode: string | null;
      gstBp: number;
      sourceIds: string[];
      documentCount: number;
      sourceDocumentIds: string[];
    }
  >;
  /** Table 9B: credit notes to registered (CDNR) and unregistered (CDNUR) customers. */
  creditNotes: Array<
    Heads & {
      documentNumber: string;
      documentDate: CivilDate;
      customerGstin: string | null;
      registered: boolean;
      /** The note's own place of supply (the invoice's): an inter-State note is reported where the supply went. */
      placeOfSupplyStateCode: string | null;
      isInterState: boolean;
      linkedNumber: string | null;
      /**
       * For an unregistered customer: 'B2CL' when the note corrects a B2C Large invoice (inter-State, above the pack's
       * threshold on the invoice's date), reported in CDNUR; null otherwise, netted into B2CS.
       */
      unregisteredType: 'B2CL' | null;
      /** The rate of this part of the note, as issued (never worked back from the heads: a few paise round to 0). */
      gstBp: number;
      sourceIds: string[];
      sourceDocumentId: string;
    }
  >;
  /**
   * Table 8: nil-rated, exempt and non-GST supplies (the 0 % parts of invoices and bills of supply), by whether the
   * supply crossed a State and whether the customer is registered. This release cannot tell nil-rated from exempt,
   * so it reports the value as nil-rated (KNOWN-GAPS).
   */
  nilExempt: Array<{
    supplyType: NilSupplyType;
    nilPaise: number;
    sourceIds: string[];
    sourceDocumentIds: string[];
  }>;
  /** Table 12: HSN summary. */
  hsnSummary: Array<
    Heads & {
      hsnCode: string | null;
      description: string;
      descriptions: string[];
      descriptionCount: number;
      unit: string | null;
      quantityMilli: number;
      gstBp: number;
    }
  >;
  /** Table 13: document number ranges. */
  /**
   * Table 13: one row per series and document type (GSTN doc types 1, invoices, and 5, credit notes): the first and
   * last number given in the period (cancelled ones included), how many stand, how many were cancelled.
   */
  documentSummary: Array<{
    docType: 'invoice' | 'credit-note';
    from: string;
    to: string;
    total: number;
    cancelled: number;
  }>;
  totals: Heads;
  /** The B2CL threshold rule read, for the report. */
  ruleIds: string[];
}

/** GSTN's Table 8 rows: inter- or intra-State, to a registered (B2B) or unregistered (B2C) customer. */
export type NilSupplyType = 'INTRB2B' | 'INTRAB2B' | 'INTRB2C' | 'INTRAB2C';

export function buildGstr1(args: {
  period: MonthPeriod;
  periods?: MonthPeriod[];
  documents: readonly OutwardDocument[];
  cancelledNumbers?: readonly string[];
  rules?: RulePack;
}): Gstr1Tables {
  const periods = args.periods ?? [args.period];
  const rules = args.rules ?? GST_RULES;
  const ruleIds = new Set<string>();
  // Order the input rather than inheriting whatever order the query returned: the same period must render the same way.
  const documents = inPeriod([...args.documents], periods).sort(
    (a, b) =>
      a.documentDate.localeCompare(b.documentDate) ||
      a.documentNumber.localeCompare(b.documentNumber, 'en', { numeric: true }) ||
      a.gstBp - b.gstBp ||
      a.id.localeCompare(b.id),
  );
  const invoices = documents.filter((d) => d.documentType === 'invoice');
  // The 0 % part of an invoice is a nil-rated, exempt or non-GST supply: Table 8, not B2B or B2C (Tables 4 to 7).
  const taxedInvoices = invoices.filter((d) => d.gstBp > 0);
  const nilInvoices = invoices.filter((d) => d.gstBp === 0);
  const notes = documents.filter((d) => d.documentType === 'credit-note');
  const heads = (d: OutwardDocument): Heads => ({
    taxablePaise: d.taxablePaise,
    cgstPaise: d.cgstPaise,
    statePaise: d.statePaise,
    igstPaise: d.igstPaise,
    cessPaise: d.cessPaise,
  });

  const b2bByGstin = new Map<string, Gstr1Tables['b2b'][number]>();
  for (const doc of taxedInvoices.filter((d) => d.customerGstin)) {
    const gstin = doc.customerGstin!;
    const bucket = b2bByGstin.get(gstin) ?? { customerGstin: gstin, customerName: doc.customerName, documents: [] };
    let entry = bucket.documents.find((d) => d.sourceDocumentId === doc.sourceDocumentId);
    if (!entry) {
      entry = {
        documentNumber: doc.documentNumber,
        documentDate: doc.documentDate,
        placeOfSupplyStateCode: doc.placeOfSupplyStateCode,
        invoiceValuePaise: doc.invoiceValuePaise,
        lines: [],
        sourceIds: [],
        sourceDocumentId: doc.sourceDocumentId,
      };
      bucket.documents.push(entry);
    }
    entry.lines.push({ gstBp: doc.gstBp, ...heads(doc) });
    entry.sourceIds.push(doc.id);
    b2bByGstin.set(gstin, bucket);
  }

  const b2cLarge: Gstr1Tables['b2cLarge'] = [];
  const b2cByKey = new Map<string, Gstr1Tables['b2cSmall'][number]>();
  for (const doc of taxedInvoices.filter((d) => !d.customerGstin)) {
    const t = thresholdOn('gstr1-b2c-large', doc.documentDate, rules);
    if (t) ruleIds.add(t.ruleId);
    const large = doc.isInterState && t !== null && doc.invoiceValuePaise > t.thresholdPaise;
    if (large) {
      let entry = b2cLarge.find((d) => d.sourceDocumentId === doc.sourceDocumentId);
      if (!entry) {
        entry = {
          documentNumber: doc.documentNumber,
          documentDate: doc.documentDate,
          placeOfSupplyStateCode: doc.placeOfSupplyStateCode,
          invoiceValuePaise: doc.invoiceValuePaise,
          lines: [],
          sourceIds: [],
          sourceDocumentId: doc.sourceDocumentId,
        };
        b2cLarge.push(entry);
      }
      entry.lines.push({ gstBp: doc.gstBp, ...heads(doc) });
      entry.sourceIds.push(doc.id);
      continue;
    }
    const key = `${doc.placeOfSupplyStateCode ?? 'none'}|${doc.gstBp}`;
    const row = b2cByKey.get(key) ?? {
      ...zero(),
      placeOfSupplyStateCode: doc.placeOfSupplyStateCode,
      gstBp: doc.gstBp,
      sourceIds: [],
      documentCount: 0,
      sourceDocumentIds: [],
    };
    add(row, heads(doc));
    row.sourceIds.push(doc.id);
    row.documentCount += 1;
    if (!row.sourceDocumentIds.includes(doc.sourceDocumentId)) row.sourceDocumentIds.push(doc.sourceDocumentId);
    b2cByKey.set(key, row);
  }

  const nilByType = new Map<NilSupplyType, Gstr1Tables['nilExempt'][number]>();
  for (const doc of nilInvoices) {
    const supplyType: NilSupplyType = `${doc.isInterState ? 'INTR' : 'INTRA'}${doc.customerGstin ? 'B2B' : 'B2C'}`;
    const row = nilByType.get(supplyType) ?? { supplyType, nilPaise: 0, sourceIds: [], sourceDocumentIds: [] };
    row.nilPaise += doc.taxablePaise;
    row.sourceIds.push(doc.id);
    if (!row.sourceDocumentIds.includes(doc.sourceDocumentId)) row.sourceDocumentIds.push(doc.sourceDocumentId);
    nilByType.set(supplyType, row);
  }
  const nilOrder: NilSupplyType[] = ['INTRB2B', 'INTRAB2B', 'INTRB2C', 'INTRAB2C'];

  const hsnByKey = new Map<string, Gstr1Tables['hsnSummary'][number]>();
  const seen = new Map<string, Set<string>>();
  for (const doc of documents) {
    const sign = doc.documentType === 'credit-note' ? -1 : 1;
    for (const l of doc.hsnLines) {
      const key = `${l.hsnCode ?? 'none'}|${l.gstBp}|${l.unit ?? 'none'}`;
      const row = hsnByKey.get(key) ?? {
        ...zero(),
        hsnCode: l.hsnCode,
        description: l.description,
        descriptions: [],
        descriptionCount: 0,
        unit: l.unit,
        quantityMilli: 0,
        gstBp: l.gstBp,
      };
      const names = seen.get(key) ?? new Set<string>();
      if (!names.has(l.description)) {
        names.add(l.description);
        seen.set(key, names);
        if (row.descriptions.length < 20) row.descriptions.push(l.description);
      }
      row.descriptionCount = names.size;
      // A credit note here corrects a value, never a quantity: it nets the value and leaves the quantity.
      if (doc.documentType === 'invoice') row.quantityMilli += l.quantityMilli;
      add(row, l, sign);
      hsnByKey.set(key, row);
    }
  }

  // A number's series is what comes before its running digits ("INV-2026-27/041" -> "INV-2026-27/"): AMC bills
  // and INV bills are two ranges, never one from AMC-…006 to INV-…041.
  const seriesOf = (n: string) => n.replace(/\d+$/, '');
  const byNumber = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });
  const summarise = (docType: 'invoice' | 'credit-note', issued: string[], cancelled: readonly string[]) => {
    const groups = new Map<string, { issued: Set<string>; cancelled: Set<string> }>();
    const group = (n: string) => {
      const g = groups.get(seriesOf(n)) ?? { issued: new Set<string>(), cancelled: new Set<string>() };
      groups.set(seriesOf(n), g);
      return g;
    };
    for (const n of issued) group(n).issued.add(n);
    for (const n of cancelled) group(n).cancelled.add(n);
    return [...groups.entries()]
      .sort(([a], [b]) => byNumber(a, b))
      .map(([, g]) => {
        const all = [...g.issued, ...g.cancelled].sort(byNumber);
        return { docType, from: all[0]!, to: all.at(-1)!, total: g.issued.size, cancelled: g.cancelled.size };
      });
  };
  const documentSummary = [
    ...summarise('invoice', [...new Set(invoices.map((d) => d.documentNumber))], args.cancelledNumbers ?? []),
    ...summarise(
      'credit-note',
      documents.filter((d) => d.documentType === 'credit-note').map((d) => d.documentNumber),
      [],
    ),
  ];
  const totals = zero();
  // The taxable value: nil-rated and exempt parts are Table 8's, not taxable supplies.
  for (const d of documents) if (d.gstBp > 0) add(totals, heads(d), d.documentType === 'credit-note' ? -1 : 1);

  return {
    period: args.period,
    periods,
    b2b: [...b2bByGstin.values()],
    b2cLarge,
    b2cSmall: [...b2cByKey.values()],
    creditNotes: notes.map((n) => {
      const linked = n.linkedInvoice ?? null;
      const large =
        !n.customerGstin && n.isInterState && linked?.valuePaise != null
          ? (() => {
              const t = thresholdOn('gstr1-b2c-large', linked.dateIso, rules);
              if (t) ruleIds.add(t.ruleId);
              return t !== null && linked.valuePaise > t.thresholdPaise;
            })()
          : false;
      return {
        ...heads(n),
        documentNumber: n.documentNumber,
        documentDate: n.documentDate,
        customerGstin: n.customerGstin,
        registered: Boolean(n.customerGstin),
        placeOfSupplyStateCode: n.placeOfSupplyStateCode,
        isInterState: n.isInterState,
        linkedNumber: linked?.number ?? null,
        unregisteredType: large ? ('B2CL' as const) : null,
        gstBp: n.gstBp,
        sourceIds: [n.id],
        sourceDocumentId: n.sourceDocumentId,
      };
    }),
    nilExempt: nilOrder.flatMap((k) => (nilByType.has(k) ? [nilByType.get(k)!] : [])),
    hsnSummary: [...hsnByKey.values()],
    documentSummary,
    totals,
    ruleIds: [...ruleIds],
  };
}

/** What to print for a grouped HSN row: name what is there, and say how much is not named. */
export function hsnRowLabel(row: {
  description: string;
  descriptions?: readonly string[];
  descriptionCount?: number;
}): string {
  const names = row.descriptions?.length ? [...row.descriptions] : [row.description];
  const total = row.descriptionCount && row.descriptionCount > 0 ? row.descriptionCount : names.length;
  if (total <= 1) return names[0] ?? row.description;
  if (total === 2 && names.length === 2) return `${names[0]} and ${names[1]}`;
  const shown = names.slice(0, 2);
  return `${shown.join(', ')} and ${total - shown.length} more`;
}

/** GSTR-3B Table 3.1: outward supplies, from the same documents. The credit side (ITC, ledgers) is Stage 8. */
export interface Gstr3bOutward {
  period: MonthPeriod;
  /** 3.1(a): taxable outward supplies (credit notes netted). */
  taxable: Heads;
  /** 3.1(c): nil-rated and exempt (0% lines), taxable value only. */
  nilRatedPaise: number;
  /** 3.2: inter-State supplies to unregistered persons, by place of supply. */
  interStateUnregistered: Array<{ placeOfSupplyStateCode: string | null; taxablePaise: number; igstPaise: number }>;
  sourceIds: string[];
}
export function buildGstr3bOutward(args: {
  period: MonthPeriod;
  periods?: MonthPeriod[];
  documents: readonly OutwardDocument[];
}): Gstr3bOutward {
  const documents = inPeriod(args.documents, args.periods ?? [args.period]);
  const taxable = zero();
  let nilRatedPaise = 0;
  const byState = new Map<string, { placeOfSupplyStateCode: string | null; taxablePaise: number; igstPaise: number }>();
  for (const d of documents) {
    const sign = d.documentType === 'credit-note' ? -1 : 1;
    if (d.gstBp === 0) {
      nilRatedPaise += sign * d.taxablePaise;
      continue;
    }
    add(
      taxable,
      {
        taxablePaise: d.taxablePaise,
        cgstPaise: d.cgstPaise,
        statePaise: d.statePaise,
        igstPaise: d.igstPaise,
        cessPaise: d.cessPaise,
      },
      sign,
    );
    // A credit note to an unregistered customer out of the State is netted against the State's row,
    // as it is in 3.1(a).
    if (d.isInterState && !d.customerGstin) {
      const key = d.placeOfSupplyStateCode ?? 'none';
      const row = byState.get(key) ?? {
        placeOfSupplyStateCode: d.placeOfSupplyStateCode,
        taxablePaise: 0,
        igstPaise: 0,
      };
      row.taxablePaise += sign * d.taxablePaise;
      row.igstPaise += sign * d.igstPaise;
      byState.set(key, row);
    }
  }
  return {
    period: args.period,
    taxable,
    nilRatedPaise,
    interStateUnregistered: [...byState.values()].filter((r) => r.taxablePaise !== 0 || r.igstPaise !== 0),
    sourceIds: documents.map((d) => d.id),
  };
}

// --- QRMP: quarterly returns with monthly obligations -----------------------
export type FilingFrequency = 'monthly' | 'quarterly-qrmp';

export interface QrmpPlan {
  months: MonthPeriod[];
  /** The period the quarterly return is filed for (the last month). */
  quarterPeriod: MonthPeriod;
  label: string;
  /** Months where IFF is available, when the taxpayer uses it. */
  iffMonths: MonthPeriod[];
  /** Months carrying a payment obligation regardless of the quarterly return. */
  monthlyPaymentMonths: MonthPeriod[];
}
export function qrmpPlan(period: MonthPeriod, usesIff: boolean): QrmpPlan {
  const q = gstQuarterOf(period);
  const months = q.months;
  return {
    months,
    quarterPeriod: months[months.length - 1]!,
    label: q.label,
    iffMonths: usesIff ? months.slice(0, 2) : [],
    monthlyPaymentMonths: months.slice(0, 2),
  };
}
export interface PeriodObligation {
  period: MonthPeriod;
  forms: Array<{ form: 'GSTR-1' | 'GSTR-3B' | 'IFF'; coversPeriods: MonthPeriod[] }>;
  /** True when a payment is due even though no return is filed this month. */
  paymentOnlyMonth: boolean;
}
export function obligationsFor(period: MonthPeriod, frequency: FilingFrequency, usesIff: boolean): PeriodObligation {
  if (frequency === 'monthly') {
    return {
      period,
      forms: [
        { form: 'GSTR-1', coversPeriods: [period] },
        { form: 'GSTR-3B', coversPeriods: [period] },
      ],
      paymentOnlyMonth: false,
    };
  }
  const plan = qrmpPlan(period, usesIff);
  if (period === plan.quarterPeriod) {
    return {
      period,
      forms: [
        { form: 'GSTR-1', coversPeriods: plan.months },
        { form: 'GSTR-3B', coversPeriods: plan.months },
      ],
      paymentOnlyMonth: false,
    };
  }
  const forms: PeriodObligation['forms'] = [];
  if (plan.iffMonths.includes(period)) forms.push({ form: 'IFF', coversPeriods: [period] });
  return { period, forms, paymentOnlyMonth: true };
}
export interface IffFurnishedRecord {
  period: MonthPeriod;
  documentNumbers: string[];
}
/** Remove from a quarterly set anything already furnished through IFF, so the same sale is never counted twice. */
export function excludeIffFurnished<T extends { documentNumber: string; documentDate: string }>(
  documents: readonly T[],
  furnished: readonly IffFurnishedRecord[],
): { included: T[]; excluded: T[] } {
  const set = new Set<string>();
  for (const f of furnished) for (const n of f.documentNumbers) set.add(`${f.period}|${n}`);
  const included: T[] = [];
  const excluded: T[] = [];
  for (const doc of documents) {
    if (set.has(`${doc.documentDate.slice(0, 7)}|${doc.documentNumber}`)) excluded.push(doc);
    else included.push(doc);
  }
  return { included, excluded };
}
export function nextFilingPeriod(period: MonthPeriod, frequency: FilingFrequency): MonthPeriod {
  return addMonthsToPeriod(period, frequency === 'monthly' ? 1 : 3);
}
