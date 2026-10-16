import { and, asc, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm';

import {
  buildGstr1,
  buildGstr3bOutward,
  outwardDocumentsFromSnapshots,
  periodBounds,
  type Gstr1Tables,
  type Gstr3bOutward,
  type IssuedSnapshot,
  type MonthPeriod,
  type OutwardDocument,
} from '@ekbill/engine';

import * as schema from '../schema';
import { withTenant, type Role, type TenantScope } from '../scope';
import { type RoleProbe, type TenancyProbe } from './allow';

/**
 * The GST workings of a period (Stage 8), from the issued snapshots only
 * (I2): GSTR-1's tables and GSTR-3B's outward figures by the engine (I4),
 * with every figure's documents for the drill-down. Read-only: nothing here
 * files anything.
 */
export interface PeriodDocument {
  id: string;
  number: string;
  kind: 'tax_invoice' | 'bill_of_supply' | 'credit_note';
  status: 'issued' | 'cancelled';
  issueDate: string;
  customerName: string;
  customerGstin: string | null;
  totalPaise: number;
  snapshot: IssuedSnapshot;
}
export interface Workings {
  months: MonthPeriod[];
  documents: PeriodDocument[];
  outward: OutwardDocument[];
  gstr1: Gstr1Tables;
  gstr3b: Gstr3bOutward;
  /** By rate (credit notes netted): what the "rate-wise" table on /gst shows. */
  byRate: Array<{
    gstBp: number;
    taxablePaise: number;
    cgstPaise: number;
    statePaise: number;
    igstPaise: number;
    sourceDocumentIds: string[];
  }>;
}

/** Nothing here writes. */
export const allowedRoles = {} as const satisfies Record<string, readonly Role[]>;

/** The issued and cancelled documents of the months, oldest first. */
export async function periodDocuments(scope: TenantScope, months: MonthPeriod[]): Promise<PeriodDocument[]> {
  if (!months.length) return [];
  const sorted = [...months].sort();
  const from = periodBounds(sorted[0]!).start;
  const to = periodBounds(sorted[sorted.length - 1]!).end;
  return withTenant(scope, async ({ db }) => {
    const rows = await db
      .select({
        id: schema.documents.id,
        number: schema.documents.number,
        kind: schema.documents.kind,
        status: schema.documents.status,
        issueDate: schema.documents.issueDate,
        customerName: schema.documents.customerName,
        customerGstin: schema.documents.customerGstin,
        totals: schema.documents.totals,
        snapshot: schema.documents.issuedSnapshot,
      })
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.businessId, scope.businessId),
          inArray(schema.documents.status, ['issued', 'cancelled']),
          isNotNull(schema.documents.issuedSnapshot),
          gte(schema.documents.issueDate, from),
          lte(schema.documents.issueDate, to),
        ),
      )
      .orderBy(asc(schema.documents.issueDate), asc(schema.documents.number));
    return rows.map((r) => ({
      id: r.id,
      number: r.number ?? '',
      kind: r.kind as PeriodDocument['kind'],
      status: r.status as PeriodDocument['status'],
      issueDate: r.issueDate,
      customerName: r.customerName,
      customerGstin: r.customerGstin,
      totalPaise: (r.totals as { totalPaise?: number } | null)?.totalPaise ?? 0,
      snapshot: r.snapshot as IssuedSnapshot,
    }));
  });
}

/** The value of each invoice the period's credit notes correct, by id: a B2C Large invoice's note goes to CDNUR. */
async function linkedInvoiceValues(scope: TenantScope, docs: readonly PeriodDocument[]): Promise<Map<string, number>> {
  const values = new Map<string, number>();
  for (const d of docs) if (d.kind !== 'credit_note') values.set(d.id, d.totalPaise);
  const missing = [
    ...new Set(
      docs.flatMap((d) =>
        d.kind === 'credit_note' && d.snapshot.linkedInvoice && !values.has(d.snapshot.linkedInvoice.id)
          ? [d.snapshot.linkedInvoice.id]
          : [],
      ),
    ),
  ];
  if (!missing.length) return values;
  return withTenant(scope, async ({ db }) => {
    const rows = await db
      .select({ id: schema.documents.id, totals: schema.documents.totals })
      .from(schema.documents)
      .where(and(eq(schema.documents.businessId, scope.businessId), inArray(schema.documents.id, missing)));
    for (const r of rows) values.set(r.id, (r.totals as { totalPaise?: number } | null)?.totalPaise ?? 0);
    return values;
  });
}

/** The months' workings: GSTR-1 tables, GSTR-3B outward, the rate split; every figure traceable to its documents. */
export async function workingsFor(scope: TenantScope, months: MonthPeriod[]): Promise<Workings> {
  const documents = await periodDocuments(scope, months);
  // A composition dealer files no GSTR-1: its bills of supply stay out. A regular business's bill of supply (GST
  // off on that bill) is a nil-rated or exempt supply: Table 8, Table 13 and 3B's 3.1(c).
  const taxed = documents.filter((d) => d.kind !== 'bill_of_supply' || d.snapshot.seller.registration === 'regular');
  const outward = outwardDocumentsFromSnapshots(
    taxed.map((d) => ({ id: d.id, number: d.number, status: d.status, snapshot: d.snapshot })),
    await linkedInvoiceValues(scope, taxed),
  );
  const period = [...months].sort().at(-1)!;
  const gstr1 = buildGstr1({
    period,
    periods: months,
    documents: outward,
    cancelledNumbers: taxed.filter((d) => d.status === 'cancelled' && d.kind !== 'credit_note').map((d) => d.number),
  });
  const gstr3b = buildGstr3bOutward({ period, periods: months, documents: outward });
  const rates = new Map<number, Workings['byRate'][number]>();
  for (const o of outward) {
    if (o.gstBp === 0) continue;
    const sign = o.documentType === 'credit-note' ? -1 : 1;
    const row = rates.get(o.gstBp) ?? {
      gstBp: o.gstBp,
      taxablePaise: 0,
      cgstPaise: 0,
      statePaise: 0,
      igstPaise: 0,
      sourceDocumentIds: [],
    };
    row.taxablePaise += sign * o.taxablePaise;
    row.cgstPaise += sign * o.cgstPaise;
    row.statePaise += sign * o.statePaise;
    row.igstPaise += sign * o.igstPaise;
    if (!row.sourceDocumentIds.includes(o.sourceDocumentId)) row.sourceDocumentIds.push(o.sourceDocumentId);
    rates.set(o.gstBp, row);
  }
  return {
    months,
    documents,
    outward,
    gstr1,
    gstr3b,
    byRate: [...rates.values()].sort((a, b) => a.gstBp - b.gstBp),
  };
}

/** The months that have bills, newest first (the period chips). */
export async function monthsWithBills(scope: TenantScope): Promise<MonthPeriod[]> {
  return withTenant(scope, async ({ client }) => {
    const r = await client.query<{ m: string }>(
      `select distinct to_char(issue_date, 'YYYY-MM') as m from documents
        where business_id = $1 and status in ('issued', 'cancelled') order by m desc limit 36`,
      [scope.businessId],
    );
    return r.rows.map((x) => x.m);
  });
}

// --- probes for the generated tests (not part of the product API)
export const roleProbes: Record<keyof typeof allowedRoles, RoleProbe> = {};
export const tenancyProbes: TenancyProbe[] = [
  {
    name: "workingsFor counts nothing of another business's bills",
    run: async (scope, other) => {
      const { probeIssuedBill } = await import('./documents');
      await probeIssuedBill(
        { ...scope, businessId: other.businessId, userId: other.userId, role: 'owner' },
        'Probe GST',
      );
      const w = await workingsFor(scope, ['2026-10']);
      const ids = new Set(w.documents.map((d) => d.id));
      const { getPool } = await import('../pool');
      const owners = ids.size
        ? (
            await getPool().query<{ business_id: string }>(
              'select distinct business_id from documents where id = any($1::uuid[])',
              [[...ids]],
            )
          ).rows.map((r) => r.business_id)
        : [scope.businessId];
      return { touched: owners };
    },
  },
];
