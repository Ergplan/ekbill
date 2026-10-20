import {
  billRecord,
  customerRecord,
  fuseRanks,
  itemRecord,
  stateName,
  tsQueryFor,
  type BillForSearch,
  type IssuedSnapshot,
  type SearchRecord,
} from '@ekbill/engine';

import { withTenant, type Role, type TenantScope, type Tx } from '../scope';
import { allow, type RoleProbe, type TenancyProbe } from './allow';
import { balancesIn } from './payments';

/**
 * Poocho's index and search (Stage 9). `refreshIndex` rewrites the rows of
 * the records that changed since they were written (a fingerprint per
 * record, computed in SQL), so a payment recorded a minute ago is in the next
 * answer; the worker does the same nightly and fills the embeddings. `search`
 * is hybrid: by words always, by meaning when the question has a vector and
 * the rows have embeddings, fused by reciprocal rank. Everything inside the
 * tenant (I1); the index holds no phone, GSTIN or bank detail.
 */
export interface SearchHit {
  id: string;
  kind: SearchRecord['kind'];
  sourceId: string;
  title: string;
  text: string;
  href: string;
}

// Every member reads; refreshing the index rewrites derived text from what they may read.
export const allowedRoles = {
  refreshIndex: ['owner', 'staff', 'accountant'],
  storeEmbeddings: ['owner', 'staff', 'accountant'],
} as const satisfies Record<string, readonly Role[]>;

const BILL_VERSION = `md5(concat_ws('|', d.status, d.cancelled_at::text, d.updated_at::text, c.city, c.updated_at::text,
  (select string_agg(p.id::text || ':' || coalesce(p.reversed_at::text, ''), ',' order by p.id) from payments p where p.document_id = d.id),
  (select string_agg(n.id::text || ':' || n.status, ',' order by n.id) from documents n where n.linked_document_id = d.id)))`;
const CUSTOMER_VERSION = `md5(concat_ws('|', c.name, c.contact_person, c.city, c.state_code, c.last_billed_at::text, c.notes, c.archived::text))`;
const ITEM_VERSION = `md5(concat_ws('|', i.name, i.description, i.hsn_sac, i.unit, i.default_rate_paise::text, i.default_tax_bp::text, i.archived::text))`;

async function upsert(tx: Tx, rows: Array<SearchRecord & { version: string; hidden: boolean }>): Promise<void> {
  for (const r of rows)
    await tx.client.query(
      `insert into search_records (business_id, kind, source_id, title, text, href, version, hidden)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (business_id, kind, source_id) do update
         set title = excluded.title, text = excluded.text, href = excluded.href, version = excluded.version,
             hidden = excluded.hidden, updated_at = now()`,
      [tx.scope.businessId, r.kind, r.sourceId, r.title, r.text, r.href, r.version, r.hidden],
    );
}

/** Rewrites what changed (at most `limit` of each kind); answers how many rows it wrote. */
export async function refreshIndex(scope: TenantScope, opts: { limit?: number } = {}): Promise<number> {
  allow(scope, allowedRoles.refreshIndex, 'refresh the search index');
  const limit = opts.limit ?? 500;
  return withTenant(scope, async (tx) => {
    const stale = await tx.client.query<{
      id: string;
      version: string;
      kind: BillForSearch['kind'];
      status: BillForSearch['status'];
      number: string;
      issue_date: string;
      due_date: string | null;
      snapshot: IssuedSnapshot;
      cancelled_reason: string | null;
      notes: string | null;
      linked_number: string | null;
      city: string | null;
    }>(
      `select d.id, ${BILL_VERSION} as version, d.kind, d.status, d.number, d.issue_date::text, d.due_date::text,
              d.issued_snapshot as snapshot, d.cancelled_reason, d.notes, l.number as linked_number, c.city
         from documents d
         left join customers c on c.id = d.customer_id
         left join documents l on l.id = d.linked_document_id
         left join search_records s on s.business_id = d.business_id and s.kind = 'bill' and s.source_id = d.id
        where d.status in ('issued', 'cancelled') and d.issued_snapshot is not null and d.kind <> 'estimate'
          and (s.id is null or s.version <> ${BILL_VERSION})
        order by d.issue_date desc
        limit $1`,
      [limit],
    );
    const ids = stale.rows.map((r) => r.id);
    const balances = await balancesIn(tx, ids);
    const payments = ids.length
      ? (
          await tx.client.query<{ document_id: string; date: string; amount_paise: string; method: string | null }>(
            `select document_id, date::text, amount_paise, method from payments
              where document_id = any($1) and kind = 'payment' and reversed_at is null order by date, created_at`,
            [ids],
          )
        ).rows
      : [];
    const notes = ids.length
      ? (
          await tx.client.query<{ linked_document_id: string; number: string; total: string }>(
            `select linked_document_id, number, (totals->>'totalPaise') as total from documents
              where linked_document_id = any($1) and kind = 'credit_note' and status = 'issued' order by issue_date`,
            [ids],
          )
        ).rows
      : [];
    const bills = stale.rows.map((r) => {
      const s = r.snapshot;
      const balance = balances.get(r.id);
      return {
        ...billRecord({
          id: r.id,
          number: r.number,
          kind: r.kind,
          status: r.status,
          dateIso: r.issue_date,
          dueDate: r.due_date,
          customerName: s.customer.name,
          customerCity: r.city,
          lines: s.lines.filter((l) => !l.blank),
          subtotalPaise: s.totals.subtotalPaise,
          gstPaise: s.totals.gstPaise,
          totalPaise: s.totals.totalPaise,
          cancelledReason: r.cancelled_reason,
          notes: r.notes,
          linkedNumber: r.linked_number,
          paidPaise: balance?.paidPaise ?? 0,
          duePaise: balance?.duePaise ?? 0,
          payments: payments
            .filter((p) => p.document_id === r.id)
            .map((p) => ({ date: p.date, amountPaise: Number(p.amount_paise), method: p.method })),
          creditNotes: notes
            .filter((n) => n.linked_document_id === r.id)
            .map((n) => ({ number: n.number, totalPaise: Number(n.total) })),
        }),
        version: r.version,
        hidden: false,
      };
    });

    const customers = await tx.client.query<{
      id: string;
      version: string;
      name: string;
      contact_person: string | null;
      city: string | null;
      state_code: string | null;
      last_billed_at: string | null;
      notes: string | null;
      archived: boolean;
    }>(
      `select c.id, ${CUSTOMER_VERSION} as version, c.name, c.contact_person, c.city, c.state_code,
              c.last_billed_at::text, c.notes, c.archived
         from customers c
         left join search_records s on s.business_id = c.business_id and s.kind = 'customer' and s.source_id = c.id
        where (s.id is null or s.version <> ${CUSTOMER_VERSION})
        limit $1`,
      [limit],
    );
    const items = await tx.client.query<{
      id: string;
      version: string;
      name: string;
      description: string | null;
      hsn_sac: string | null;
      unit: string | null;
      default_rate_paise: string | null;
      default_tax_bp: number | null;
      archived: boolean;
    }>(
      `select i.id, ${ITEM_VERSION} as version, i.name, i.description, i.hsn_sac, i.unit,
              i.default_rate_paise, i.default_tax_bp, i.archived
         from items i
         left join search_records s on s.business_id = i.business_id and s.kind = 'item' and s.source_id = i.id
        where (s.id is null or s.version <> ${ITEM_VERSION})
        limit $1`,
      [limit],
    );
    const rows = [
      ...bills,
      ...customers.rows.map((c) => ({
        ...customerRecord({
          id: c.id,
          name: c.name,
          contactPerson: c.contact_person,
          city: c.city,
          stateName: c.state_code ? stateName(c.state_code) : null,
          lastBilledAt: c.last_billed_at,
          notes: c.notes,
        }),
        version: c.version,
        hidden: c.archived,
      })),
      ...items.rows.map((i) => ({
        ...itemRecord({
          id: i.id,
          name: i.name,
          description: i.description,
          hsnSac: i.hsn_sac,
          unit: i.unit,
          defaultRatePaise: i.default_rate_paise === null ? null : Number(i.default_rate_paise),
          defaultTaxBp: i.default_tax_bp,
        }),
        version: i.version,
        hidden: i.archived,
      })),
    ];
    await upsert(tx, rows);
    return rows.length;
  });
}

const toVector = (v: readonly number[]) => `[${v.join(',')}]`;

/**
 * The records most relevant to a question: by words, and by meaning when
 * `vector` is given, fused. Meaning has a floor (cosine distance below
 * MAX_DISTANCE): the nearest records to a question about nothing are not an
 * answer, and the owner is told nothing was found.
 */
export const MAX_DISTANCE = 0.7;
export async function search(
  scope: TenantScope,
  input: { question: string; vector?: readonly number[] | null; model?: string | null; k?: number },
): Promise<SearchHit[]> {
  const q = tsQueryFor(input.question);
  return withTenant(scope, async (tx) => {
    const lists: string[][] = [];
    const byId = new Map<string, SearchHit>();
    const keep = (rows: SearchHit[]) => {
      for (const r of rows) byId.set(r.id, r);
      lists.push(rows.map((r) => r.id));
    };
    const cols = 'id, kind, source_id as "sourceId", title, text, href';
    if (q)
      keep(
        (
          await tx.client.query<SearchHit>(
            `select ${cols} from search_records
              where not hidden and tsv @@ to_tsquery('simple', $1)
              order by ts_rank(tsv, to_tsquery('simple', $1)) desc, updated_at desc limit 20`,
            [q],
          )
        ).rows,
      );
    // Only vectors made by the question's own model from the record's current text (Stage 9 review: another
    // model's vectors are not comparable, and a record edited since its embedding no longer says what it did).
    if (input.vector?.length && input.model)
      keep(
        (
          await tx.client.query<SearchHit>(
            `select ${cols} from search_records
              where not hidden and embedding is not null and embed_model = $3 and embedded_version = version
                and embedding <=> $1::vector < $2
              order by embedding <=> $1::vector limit 20`,
            [toVector(input.vector), MAX_DISTANCE, input.model],
          )
        ).rows,
      );
    return fuseRanks(lists)
      .slice(0, input.k ?? 8)
      .map((id) => byId.get(id)!);
  });
}

/** Rows whose embedding is missing, behind their text, or made by another model (the worker's batch). */
export async function pendingEmbeddings(
  scope: TenantScope,
  limit = 64,
  model: string | null = null,
): Promise<Array<{ id: string; version: string; text: string }>> {
  return withTenant(scope, async (tx) =>
    (
      await tx.client.query<{ id: string; version: string; title: string; text: string }>(
        `select id, version, title, text from search_records
          where not hidden and (embedded_version is distinct from version
                                or ($2::text is not null and embed_model is distinct from $2))
          order by updated_at limit $1`,
        [limit, model],
      )
    ).rows.map((r) => ({ id: r.id, version: r.version, text: `${r.title}\n${r.text}` })),
  );
}

/** Keeps the vectors made from `version`; a row rewritten since keeps waiting for its own. */
export async function storeEmbeddings(
  scope: TenantScope,
  rows: ReadonlyArray<{ id: string; version: string; vector: readonly number[] }>,
  model: string,
): Promise<number> {
  allow(scope, allowedRoles.storeEmbeddings, 'store embeddings');
  return withTenant(scope, async (tx) => {
    let n = 0;
    for (const r of rows) {
      const res = await tx.client.query(
        `update search_records set embedding = $1::vector, embedded_version = $2, embed_model = $3
          where id = $4 and version = $2`,
        [toVector(r.vector), r.version, model, r.id],
      );
      n += res.rowCount ?? 0;
    }
    return n;
  });
}

// --- probes for the generated tests (not part of the product API)
export const roleProbes: Record<keyof typeof allowedRoles, RoleProbe> = {
  refreshIndex: (scope) => refreshIndex(scope, { limit: 5 }),
  storeEmbeddings: (scope) => storeEmbeddings(scope, [], 'probe'),
};
export const tenancyProbes: TenancyProbe[] = [
  {
    name: "search finds nothing of another business's records",
    run: async (scope, other) => {
      await refreshIndex({ ...scope, businessId: other.businessId, userId: other.userId, role: 'staff' });
      await refreshIndex(scope);
      const hits = await withTenant(
        scope,
        async (tx) => (await tx.client.query<{ business_id: string }>('select business_id from search_records')).rows,
      );
      return { touched: [...new Set(hits.map((h) => h.business_id))] };
    },
  },
];
