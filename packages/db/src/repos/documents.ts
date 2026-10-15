import { and, asc, desc, eq, sql } from 'drizzle-orm';

import {
  GST_RULES,
  TaxEngineError,
  RuleError,
  afterAllocation,
  assertCivilDate,
  computeTax,
  documentKind,
  emptyTax,
  nextNumberFor,
  prepareIssue,
  type Assessment,
  type Blocker,
  type IssueBusiness,
  type IssueCustomer,
  type IssueLine,
  type IssuedSnapshot,
  type Registration,
  type SupplyFlag,
  type TaxResult,
} from '@ekbill/engine';

import * as schema from '../schema';
import { withTenant, type Role, type TenantScope, type Tx } from '../scope';
import { allow, NotFoundError, type RoleProbe, type TenancyProbe } from './allow';
import { configOf, type SeriesKind } from './series';

/**
 * Documents (I2, I3). A draft is the owner's working copy; issueDocument()
 * is the one place a document becomes issued: in one transaction it locks
 * the draft and its series, asks the pure engine (prepareIssue) whether the
 * document may go out and what it says, allocates the next number, and
 * writes the number, the snapshot and the totals. The triggers in
 * migrations/0002_documents.sql hold the rest: nothing else may set
 * status = 'issued' (the issue_gate reads app.issuing, set only here), and
 * an issued row's number, lines, totals and snapshot never change.
 * Corrections are new documents that link back: a credit note, a redo.
 */
export type DocumentKindColumn = 'tax_invoice' | 'bill_of_supply' | 'credit_note';
export type DocumentStatus = 'draft' | 'issued' | 'cancelled';

export interface Document {
  id: string;
  businessId: string;
  seriesId: string;
  kind: DocumentKindColumn;
  status: DocumentStatus;
  number: string | null;
  financialYear: string | null;
  issueDate: string;
  dueDate: string | null;
  customerId: string | null;
  customerName: string;
  customerGstin: string | null;
  customerState: string | null;
  customerAddress: string | null;
  customerPhone: string | null;
  placeOfSupplyState: string | null;
  flags: SupplyFlag[];
  lines: IssueLine[];
  /** A draft's running figures (never authoritative); the engine's result once issued. */
  totals: TaxResult | null;
  issuedSnapshot: IssuedSnapshot | null;
  issuedAt: Date | null;
  linkedDocumentId: string | null;
  irn: string | null;
  cancelledAt: Date | null;
  cancelledReason: string | null;
  notes: string | null;
  roundToRupee: boolean;
  gstOn: boolean;
  revision: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DraftCustomer {
  id?: string | null;
  name: string;
  gstin?: string | null;
  stateCode?: string | null;
  address?: string | null;
  phone?: string | null;
}

export interface DraftInput {
  /** The series to number it in; the business's default bill series when absent. */
  seriesId?: string | null;
  customer: DraftCustomer;
  dateIso: string;
  dueDateIso?: string | null;
  /** "GST lagega?" for a registered seller; ignored for the rest. */
  gstOn?: boolean;
  lines: IssueLine[];
  placeOfSupplyStateCode?: string | null;
  flags?: SupplyFlag[];
  notes?: string | null;
  roundToRupee?: boolean;
}

/** The engine said no: the blockers say why and what to do, in Say keys the screen renders. */
export class IssueRefusedError extends Error {
  constructor(
    public readonly blockers: Blocker[],
    public readonly assessment: Assessment,
  ) {
    super(`cannot issue: ${blockers.map((b) => b.code).join(', ')}`);
    this.name = 'IssueRefusedError';
  }
}
/** The document is not in the state the call needs (issue a draft, cancel an issued one, credit an issued invoice). */
export class DocumentStateError extends Error {
  constructor(
    public readonly code:
      'not-a-draft' | 'not-issued' | 'series-inactive' | 'series-kind' | 'credit-note-exists' | 'bad-lines',
    message: string,
  ) {
    super(message);
    this.name = 'DocumentStateError';
  }
}

/** Staff make bills and credit-note drafts; only the owner issues a credit note or cancels (Stage 6 roles). */
export const allowedRoles = {
  createDraft: ['owner', 'staff'],
  updateDraft: ['owner', 'staff'],
  issue: ['owner', 'staff'],
  cancel: ['owner'],
  createCreditNote: ['owner'],
} as const satisfies Record<string, readonly Role[]>;

type Row = typeof schema.documents.$inferSelect;
const asDocument = (row: Row): Document => row as unknown as Document;

const REGISTRATION: Record<string, Registration> = {
  regular: 'regular',
  composition: 'composition',
  'not-registered': 'unregistered',
  'not-sure': 'unknown',
};

/** The seller as the engine sees it, from the business row at this moment (the snapshot freezes it). */
export function sellerOf(b: typeof schema.businesses.$inferSelect): IssueBusiness {
  return {
    registration: REGISTRATION[b.registrationType] ?? 'unknown',
    gstin: b.gstin,
    stateCode: b.stateCode,
    turnoverPaise: b.turnoverPaise,
    eInvoiceSelfDeclaredNotApplicable: b.eInvoicingApplies === false,
    legalName: b.legalName,
    tradeName: b.tradeName,
    address: b.address,
    city: b.city,
    phone: b.phone,
    upi: b.upi,
  };
}

function customerOf(row: Row): IssueCustomer {
  return {
    id: row.customerId,
    name: row.customerName,
    gstin: row.customerGstin,
    stateCode: row.customerState,
    address: row.customerAddress,
    phone: row.customerPhone,
  };
}

/** The column value for what the engine decided; a plain invoice (no tax charged) is kept as a bill of supply. */
function kindColumn(kind: Exclude<Assessment['kind'], 'blocked'>): DocumentKindColumn {
  if (kind === 'tax-invoice') return 'tax_invoice';
  if (kind === 'credit-note') return 'credit_note';
  return 'bill_of_supply';
}

async function businessRow(tx: Tx) {
  const row = (await tx.db.select().from(schema.businesses).where(eq(schema.businesses.id, tx.scope.businessId)))[0];
  if (!row) throw new NotFoundError('business');
  return row;
}

/** A draft's running figures: the same engine, never stored as the truth (the issue writes the truth). */
function previewTotals(
  lines: IssueLine[],
  seller: IssueBusiness,
  input: { gstOn: boolean; dateIso: string; customerStateCode: string | null; roundToRupee: boolean },
): TaxResult {
  try {
    return computeTax({
      lines: lines.filter((l) => l.description.trim()),
      registration: seller.registration,
      gstOn: input.gstOn,
      dateIso: input.dateIso,
      sellerStateCode: seller.stateCode,
      customerStateCode: input.customerStateCode,
      roundToRupee: input.roundToRupee,
      rules: GST_RULES,
    });
  } catch (e) {
    if (e instanceof RuleError) return emptyTax();
    if (e instanceof TaxEngineError) throw new DocumentStateError('bad-lines', e.message);
    throw e;
  }
}

async function seriesFor(tx: Tx, id: string | null | undefined, kind: SeriesKind) {
  const row = id
    ? (await tx.db.select().from(schema.series).where(eq(schema.series.id, id)))[0]
    : (
        await tx.db
          .select()
          .from(schema.series)
          .where(and(eq(schema.series.kind, kind), eq(schema.series.active, true)))
          .orderBy(asc(schema.series.createdAt))
          .limit(1)
      )[0];
  if (!row) throw new NotFoundError('series');
  if (row.kind !== kind) throw new DocumentStateError('series-kind', `series ${row.name} is for ${row.kind}s`);
  if (!row.active) throw new DocumentStateError('series-inactive', `series ${row.name} is retired`);
  return row;
}

export async function createDraft(scope: TenantScope, input: DraftInput): Promise<Document> {
  allow(scope, allowedRoles.createDraft, 'make a bill');
  const dateIso = assertCivilDate(input.dateIso, 'bill date');
  const dueDate = input.dueDateIso ? assertCivilDate(input.dueDateIso, 'due date') : null;
  return withTenant(scope, async (tx) => {
    const business = await businessRow(tx);
    const seller = sellerOf(business);
    const series = await seriesFor(tx, input.seriesId, 'bill');
    const gstOn = input.gstOn ?? true;
    const customerState = input.customer.stateCode ?? null;
    const placeOfSupply = input.placeOfSupplyStateCode ?? customerState;
    const totals = previewTotals(input.lines, seller, {
      gstOn,
      dateIso,
      customerStateCode: placeOfSupply,
      roundToRupee: input.roundToRupee ?? false,
    });
    const kind = (() => {
      try {
        return documentKind(seller.registration, gstOn, dateIso) === 'tax-invoice' ? 'tax_invoice' : 'bill_of_supply';
      } catch {
        return 'bill_of_supply';
      }
    })();
    const [row] = await tx.db
      .insert(schema.documents)
      .values({
        businessId: scope.businessId,
        seriesId: series.id,
        kind,
        status: 'draft',
        issueDate: dateIso,
        dueDate,
        customerId: input.customer.id ?? null,
        customerName: input.customer.name.trim(),
        customerGstin: input.customer.gstin ?? null,
        customerState,
        customerAddress: input.customer.address ?? null,
        customerPhone: input.customer.phone ?? null,
        placeOfSupplyState: placeOfSupply,
        flags: input.flags ?? [],
        lines: input.lines,
        totals,
        notes: input.notes ?? null,
        roundToRupee: input.roundToRupee ?? false,
        gstOn,
        createdBy: scope.userId,
      })
      .returning();
    return asDocument(row!);
  });
}

export type DraftPatch = Partial<Omit<DraftInput, 'seriesId'>> & { seriesId?: string | null };

export async function updateDraft(scope: TenantScope, id: string, patch: DraftPatch): Promise<Document> {
  allow(scope, allowedRoles.updateDraft, 'change a bill');
  return withTenant(scope, async (tx) => {
    const current = (await tx.db.select().from(schema.documents).where(eq(schema.documents.id, id)).for('update'))[0];
    if (!current) throw new NotFoundError('document');
    if (current.status !== 'draft')
      throw new DocumentStateError('not-a-draft', `document ${current.number} is ${current.status}`);
    const business = await businessRow(tx);
    const seller = sellerOf(business);
    const kindOfSeries: SeriesKind = current.kind === 'credit_note' ? 'credit_note' : 'bill';
    const series = patch.seriesId !== undefined ? await seriesFor(tx, patch.seriesId, kindOfSeries) : null;
    const dateIso = patch.dateIso !== undefined ? assertCivilDate(patch.dateIso, 'bill date') : current.issueDate;
    const dueDate =
      patch.dueDateIso !== undefined
        ? patch.dueDateIso
          ? assertCivilDate(patch.dueDateIso, 'due date')
          : null
        : current.dueDate;
    const customer = patch.customer;
    const customerState = customer ? (customer.stateCode ?? null) : current.customerState;
    const placeOfSupply =
      patch.placeOfSupplyStateCode !== undefined
        ? patch.placeOfSupplyStateCode
        : customer
          ? customerState
          : current.placeOfSupplyState;
    const gstOn = patch.gstOn ?? current.gstOn;
    const lines = (patch.lines ?? current.lines) as IssueLine[];
    const roundToRupee = patch.roundToRupee ?? current.roundToRupee;
    const totals = previewTotals(lines, seller, { gstOn, dateIso, customerStateCode: placeOfSupply, roundToRupee });
    const [row] = await tx.db
      .update(schema.documents)
      .set({
        ...(series ? { seriesId: series.id } : {}),
        issueDate: dateIso,
        dueDate,
        ...(customer
          ? {
              customerId: customer.id ?? null,
              customerName: customer.name.trim(),
              customerGstin: customer.gstin ?? null,
              customerState,
              customerAddress: customer.address ?? null,
              customerPhone: customer.phone ?? null,
            }
          : {}),
        placeOfSupplyState: placeOfSupply,
        ...(patch.flags !== undefined ? { flags: patch.flags } : {}),
        lines,
        totals,
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        roundToRupee,
        gstOn,
        revision: sql`${schema.documents.revision} + 1`,
        updatedAt: sql`now()`,
      })
      .where(eq(schema.documents.id, id))
      .returning();
    return asDocument(row!);
  });
}

export async function getDocument(scope: TenantScope, id: string): Promise<Document> {
  return withTenant(scope, async ({ db }) => {
    const row = (await db.select().from(schema.documents).where(eq(schema.documents.id, id)))[0];
    if (!row) throw new NotFoundError('document');
    return asDocument(row);
  });
}

export async function listDocuments(
  scope: TenantScope,
  filter: { status?: DocumentStatus; kind?: DocumentKindColumn; limit?: number } = {},
): Promise<Document[]> {
  return withTenant(scope, async ({ db }) => {
    const rows = await db
      .select()
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.businessId, scope.businessId),
          ...(filter.status ? [eq(schema.documents.status, filter.status)] : []),
          ...(filter.kind ? [eq(schema.documents.kind, filter.kind)] : []),
        ),
      )
      .orderBy(desc(schema.documents.issueDate), desc(schema.documents.createdAt))
      .limit(filter.limit ?? 200);
    return rows.map(asDocument);
  });
}

/**
 * I2, I3: the one writer. Locks the draft, then its series (always in that
 * order, so two issues of one series queue rather than deadlock), asks the
 * engine, allocates, writes. A refusal rolls everything back: no number is
 * spent on a bill that did not go out.
 */
export async function issueDocument(scope: TenantScope, input: { id: string; today: string }): Promise<Document> {
  allow(scope, allowedRoles.issue, 'issue a bill');
  const today = assertCivilDate(input.today, 'today');
  return withTenant(scope, async (tx) => {
    const { db, client } = tx;
    await client.query("select set_config('app.issuing', '1', true)");
    const draft = (await db.select().from(schema.documents).where(eq(schema.documents.id, input.id)).for('update'))[0];
    if (!draft) throw new NotFoundError('document');
    if (draft.status !== 'draft')
      throw new DocumentStateError('not-a-draft', `document ${draft.number} is already ${draft.status}`);
    const series = (await db.select().from(schema.series).where(eq(schema.series.id, draft.seriesId)).for('update'))[0];
    if (!series) throw new NotFoundError('series');
    if (!series.active) throw new DocumentStateError('series-inactive', `series ${series.name} is retired`);
    const wantKind: SeriesKind = draft.kind === 'credit_note' ? 'credit_note' : 'bill';
    if (series.kind !== wantKind)
      throw new DocumentStateError('series-kind', `series ${series.name} is for ${series.kind}s`);

    const business = await businessRow(tx);
    let linked: { id: string; number: string; dateIso: string } | null = null;
    if (draft.kind === 'credit_note') {
      const invoice = draft.linkedDocumentId
        ? (await db.select().from(schema.documents).where(eq(schema.documents.id, draft.linkedDocumentId)))[0]
        : undefined;
      if (!invoice) throw new NotFoundError('linked invoice');
      if (invoice.status !== 'issued' || !invoice.number)
        throw new DocumentStateError('not-issued', `invoice ${invoice.number ?? invoice.id} is ${invoice.status}`);
      linked = { id: invoice.id, number: invoice.number, dateIso: invoice.issueDate };
    }

    const prepared = prepareIssue(
      {
        kind: draft.kind === 'credit_note' ? 'credit-note' : 'bill',
        dateIso: draft.issueDate,
        gstOn: draft.gstOn,
        lines: draft.lines as IssueLine[],
        placeOfSupplyStateCode: draft.placeOfSupplyState,
        flags: draft.flags as SupplyFlag[],
        roundToRupee: draft.roundToRupee,
        notes: draft.notes,
        linkedInvoice: linked,
      },
      sellerOf(business),
      customerOf(draft),
      GST_RULES,
      today,
    );
    if (!prepared.ok) throw new IssueRefusedError(prepared.blockers, prepared.assessment);

    const config = configOf(series);
    const allocated = nextNumberFor(config, draft.issueDate);
    const after = afterAllocation(config, allocated);
    await db
      .update(schema.series)
      .set({ nextNumber: after.nextNumber, fy: after.financialYear, updatedAt: sql`now()` })
      .where(eq(schema.series.id, series.id));

    const [row] = await db
      .update(schema.documents)
      .set({
        status: 'issued',
        kind: kindColumn(prepared.kind),
        number: allocated.number,
        financialYear: allocated.financialYear,
        issuedAt: sql`now()`,
        issuedSnapshot: prepared.snapshot,
        totals: prepared.totals,
        lines: prepared.totals.lines,
        customerName: prepared.snapshot.customer.name,
        customerGstin: prepared.snapshot.customer.gstin,
        customerState: prepared.snapshot.customer.stateCode,
        placeOfSupplyState: prepared.snapshot.placeOfSupplyStateCode,
        revision: sql`${schema.documents.revision} + 1`,
        updatedAt: sql`now()`,
      })
      .where(eq(schema.documents.id, draft.id))
      .returning();
    return asDocument(row!);
  });
}

/** Owner only. An issued document is cancelled, never removed; a bill with a credit note against it is corrected already. */
export async function cancelDocument(scope: TenantScope, input: { id: string; reason: string }): Promise<Document> {
  allow(scope, allowedRoles.cancel, 'cancel a bill');
  return withTenant(scope, async ({ db }) => {
    const current = (
      await db.select().from(schema.documents).where(eq(schema.documents.id, input.id)).for('update')
    )[0];
    if (!current) throw new NotFoundError('document');
    if (current.status !== 'issued')
      throw new DocumentStateError('not-issued', `document ${current.number ?? current.id} is ${current.status}`);
    const notes = await db
      .select({ id: schema.documents.id })
      .from(schema.documents)
      .where(and(eq(schema.documents.linkedDocumentId, current.id), eq(schema.documents.status, 'issued')))
      .limit(1);
    if (notes.length)
      throw new DocumentStateError('credit-note-exists', `document ${current.number} already has a credit note`);
    const [row] = await db
      .update(schema.documents)
      .set({
        status: 'cancelled',
        cancelledAt: sql`now()`,
        cancelledReason: input.reason.trim() || null,
        revision: sql`${schema.documents.revision} + 1`,
        updatedAt: sql`now()`,
      })
      .where(eq(schema.documents.id, current.id))
      .returning();
    return asDocument(row!);
  });
}

export interface CreditNoteInput {
  invoiceId: string;
  dateIso: string;
  /** What is credited back, as lines (the engine prices them the way it priced the bill). */
  lines: IssueLine[];
  reason?: string | null;
  seriesId?: string | null;
}

/**
 * Owner only. A credit note is a draft in the credit-note series that links
 * to an issued invoice and carries its customer; issueDocument() numbers it.
 */
export async function createCreditNote(scope: TenantScope, input: CreditNoteInput): Promise<Document> {
  allow(scope, allowedRoles.createCreditNote, 'make a credit note');
  const dateIso = assertCivilDate(input.dateIso, 'credit note date');
  return withTenant(scope, async (tx) => {
    const invoice = (await tx.db.select().from(schema.documents).where(eq(schema.documents.id, input.invoiceId)))[0];
    if (!invoice) throw new NotFoundError('invoice');
    if (invoice.status !== 'issued' || !invoice.issuedSnapshot)
      throw new DocumentStateError('not-issued', `document ${invoice.number ?? invoice.id} is ${invoice.status}`);
    const snapshot = invoice.issuedSnapshot as IssuedSnapshot;
    const business = await businessRow(tx);
    const seller = sellerOf(business);
    const series = await seriesFor(tx, input.seriesId, 'credit_note');
    const gstOn = snapshot.kind === 'tax-invoice';
    const totals = previewTotals(input.lines, seller, {
      gstOn,
      dateIso,
      customerStateCode: snapshot.placeOfSupplyStateCode,
      roundToRupee: invoice.roundToRupee,
    });
    const [row] = await tx.db
      .insert(schema.documents)
      .values({
        businessId: scope.businessId,
        seriesId: series.id,
        kind: 'credit_note',
        status: 'draft',
        issueDate: dateIso,
        customerId: snapshot.customer.id,
        customerName: snapshot.customer.name,
        customerGstin: snapshot.customer.gstin,
        customerState: snapshot.customer.stateCode,
        customerAddress: snapshot.customer.address,
        customerPhone: snapshot.customer.phone,
        placeOfSupplyState: snapshot.placeOfSupplyStateCode,
        flags: snapshot.flags,
        lines: input.lines,
        totals,
        linkedDocumentId: invoice.id,
        notes: input.reason ?? null,
        roundToRupee: invoice.roundToRupee,
        gstOn,
        createdBy: scope.userId,
      })
      .returning();
    return asDocument(row!);
  });
}

// --- probes for the generated tests (not part of the product API)
const PROBE_TODAY = '2026-10-15';
const probeDraft = (): DraftInput => ({
  customer: { name: 'Probe Customer', stateCode: '27' },
  dateIso: PROBE_TODAY,
  lines: [{ description: 'Probe work', quantityMilli: 1000, unitPricePaise: 50000, gstBp: 1800, taxRateChosen: true }],
});
export const roleProbes: Record<keyof typeof allowedRoles, RoleProbe> = {
  createDraft: (scope) => createDraft(scope, probeDraft()),
  updateDraft: async (scope) => {
    const d = await createDraft(scope, probeDraft());
    return updateDraft(scope, d.id, { notes: 'probe' });
  },
  issue: async (scope) => {
    const d = await createDraft(scope, probeDraft());
    return issueDocument(scope, { id: d.id, today: PROBE_TODAY });
  },
  cancel: async (scope) => {
    const d = await createDraft(scope, probeDraft());
    const issued = await issueDocument(scope, { id: d.id, today: PROBE_TODAY });
    return cancelDocument(scope, { id: issued.id, reason: 'probe' });
  },
  createCreditNote: async (scope) => {
    const d = await createDraft(scope, probeDraft());
    const issued = await issueDocument(scope, { id: d.id, today: PROBE_TODAY });
    return createCreditNote(scope, { invoiceId: issued.id, dateIso: PROBE_TODAY, lines: probeDraft().lines });
  },
};
const scopeOfOther = (scope: TenantScope, other: { businessId: string; userId: string }): TenantScope => ({
  ...scope,
  businessId: other.businessId,
  userId: other.userId,
  role: 'staff',
});
export const tenancyProbes: TenancyProbe[] = [
  {
    name: 'listDocuments lists only its own documents',
    run: async (scope, other) => {
      await createDraft(scopeOfOther(scope, other), probeDraft());
      return { touched: [...new Set((await listDocuments(scope)).map((d) => d.businessId))] };
    },
  },
  {
    name: "getDocument cannot see another business's draft",
    run: async (scope, other) => {
      const theirs = await createDraft(scopeOfOther(scope, other), probeDraft());
      try {
        await getDocument(scope, theirs.id);
        return { touched: [other.businessId] };
      } catch (e) {
        if (e instanceof NotFoundError) return { touched: [scope.businessId] };
        throw e;
      }
    },
  },
  {
    name: "issueDocument cannot issue another business's draft",
    run: async (scope, other) => {
      const theirs = await createDraft(scopeOfOther(scope, other), probeDraft());
      try {
        await issueDocument(scope, { id: theirs.id, today: PROBE_TODAY });
        return { touched: [other.businessId] };
      } catch (e) {
        if (e instanceof NotFoundError) return { touched: [scope.businessId] };
        throw e;
      }
    },
  },
];
