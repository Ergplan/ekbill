import { and, asc, desc, eq, gte, inArray, isNull, ne, sql } from 'drizzle-orm';

import {
  GST_RULES,
  TaxEngineError,
  type Balance,
  RuleError,
  ageInDays,
  afterAllocation,
  assertCivilDate,
  computeTax,
  documentKind,
  emptyTax,
  financialYearOf,
  formatMoneyIndian,
  isEarlierYear,
  MAX_NUMBER_LENGTH,
  nextNumberFor,
  prepareIssue,
  sequenceOf,
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
import { balancesIn } from './payments';
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
      | 'not-a-draft'
      | 'not-issued'
      | 'not-a-bill'
      | 'has-money'
      | 'series-inactive'
      | 'series-kind'
      | 'credit-note-exists'
      | 'bad-lines',
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
    // Stage 6: the bank, and the logo and signature as the files they are at issue (business files never change),
    // so a re-rendered bill prints what the customer got (I2).
    bank: b.bankAccount && b.bankIfsc ? { name: b.bankName ?? '', account: b.bankAccount, ifsc: b.bankIfsc } : null,
    logoRef: b.logoFileId,
    signatureRef: b.signatureFileId,
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
  // No series named: the business's default bill series (Aap), else its oldest active one of the kind.
  if (!id && kind === 'bill') {
    const chosen = (
      await tx.db
        .select({ id: schema.businesses.defaultSeriesId })
        .from(schema.businesses)
        .where(eq(schema.businesses.id, tx.scope.businessId))
    )[0]?.id;
    const row = chosen ? (await tx.db.select().from(schema.series).where(eq(schema.series.id, chosen)))[0] : undefined;
    if (row && row.active && row.kind === 'bill') return row;
  }
  const row = id
    ? (await tx.db.select().from(schema.series).where(eq(schema.series.id, id)))[0]
    : (
        await tx.db
          .select()
          .from(schema.series)
          .where(and(eq(schema.series.kind, kind), eq(schema.series.active, true)))
          .orderBy(asc(schema.series.createdAt), asc(schema.series.id))
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
    // A credit note is the owner's, draft or not (Stage 11 review: staff could rewrite one through the bill form).
    if (current.kind === 'credit_note') allow(scope, allowedRoles.createCreditNote, 'change a credit note');
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
    let creditablePaise: number | null = null;
    if (draft.kind === 'credit_note') {
      // Owner only; and the bill is locked for the rest of this transaction, so two notes at once (a double tap,
      // two tabs), a note and a cancel, or a note and a payment, are taken one after the other (Stage 11 review).
      allow(scope, allowedRoles.createCreditNote, 'issue a credit note');
      const invoice = draft.linkedDocumentId
        ? (
            await db
              .select()
              .from(schema.documents)
              .where(eq(schema.documents.id, draft.linkedDocumentId))
              .for('update')
          )[0]
        : undefined;
      if (!invoice) throw new NotFoundError('linked invoice');
      if (invoice.kind === 'credit_note')
        throw new DocumentStateError('not-a-bill', `${invoice.number} is a credit note, not a bill`);
      if (invoice.status !== 'issued' || !invoice.number)
        throw new DocumentStateError('not-issued', `invoice ${invoice.number ?? invoice.id} is ${invoice.status}`);
      linked = { id: invoice.id, number: invoice.number, dateIso: invoice.issueDate };
      const [credited] = await db
        .select({
          paise: sql<number>`coalesce(sum((${schema.documents.totals}->>'totalPaise')::bigint), 0)`.mapWith(Number),
        })
        .from(schema.documents)
        .where(
          and(
            eq(schema.documents.linkedDocumentId, invoice.id),
            eq(schema.documents.kind, 'credit_note'),
            eq(schema.documents.status, 'issued'),
          ),
        );
      creditablePaise = ((invoice.totals as TaxResult | null)?.totalPaise ?? 0) - (credited?.paise ?? 0);
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
    if (creditablePaise !== null && prepared.totals.totalPaise > creditablePaise)
      throw new IssueRefusedError(
        [
          {
            code: 'credit-more-than-bill',
            message: {
              key: 'assess.credit-more-than-bill',
              params: { left: formatMoneyIndian(Math.max(0, creditablePaise), { withSymbol: true }) },
            },
            whatYouCanDo: { key: 'assess.credit-more-than-bill.do' },
            ruleId: null,
          },
        ],
        prepared.assessment,
      );

    const config = configOf(series);
    // A date in a year before the one the series has reached continues that year's numbers (read under the series
    // lock taken above); the series itself does not move back.
    let highestInEarlierYear: number | null = null;
    if (isEarlierYear(config, draft.issueDate)) {
      const fy = financialYearOf(draft.issueDate);
      const numbers = await db
        .select({ number: schema.documents.number })
        .from(schema.documents)
        .where(and(eq(schema.documents.seriesId, series.id), eq(schema.documents.financialYear, fy)));
      highestInEarlierYear = numbers.reduce(
        (top, r) => Math.max(top, (r.number && sequenceOf(config, fy, r.number)) || 0),
        0,
      );
    }
    const allocated = nextNumberFor(config, draft.issueDate, highestInEarlierYear);
    // Rule 46: a number of at most 16 characters. A series that fits today can outgrow it (INV-2026-27/9999 is 16,
    // the 10,000th bill of the year 17): refuse in words rather than print a number the law does not allow.
    if (allocated.number.length > MAX_NUMBER_LENGTH)
      throw new IssueRefusedError(
        [
          {
            code: 'number-too-long',
            message: { key: 'assess.number-too-long', params: { number: allocated.number } },
            whatYouCanDo: { key: 'assess.number-too-long.do' },
            ruleId: null,
          },
        ],
        prepared.assessment,
      );
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
    // The customer's directory order (Stage 6): the date of their latest bill, never moved back.
    if (row!.customerId && row!.kind !== 'credit_note')
      await db
        .update(schema.customers)
        .set({
          lastBilledAt: sql`greatest(coalesce(${schema.customers.lastBilledAt}, ${row!.issueDate}), ${row!.issueDate})`,
        })
        .where(eq(schema.customers.id, row!.customerId));
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
    // Money recorded on a bill would vanish with it: a cancelled bill shows nothing due, takes no reversal, and the
    // redo starts at the full amount (Stage 11 review). The entries are reversed first, in words, then the bill goes.
    const money = await db
      .select({ id: schema.payments.id })
      .from(schema.payments)
      .where(and(eq(schema.payments.documentId, current.id), isNull(schema.payments.reversedAt)))
      .limit(1);
    if (money.length)
      throw new DocumentStateError('has-money', `document ${current.number} has money recorded; reverse it first`);
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
    if (invoice.kind === 'credit_note')
      throw new DocumentStateError('not-a-bill', `${invoice.number} is a credit note, not a bill`);
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

export type BillFilter = 'all' | 'due' | 'paid' | 'cancelled';
export interface BillRow {
  id: string;
  number: string;
  /** The year the number belongs to: a series without the year in its numbers starts again each April. */
  financialYear: string | null;
  kind: DocumentKindColumn;
  status: DocumentStatus;
  issueDate: string;
  customerId: string | null;
  customerName: string;
  seriesId: string;
  totalPaise: number;
  balance: Balance;
  linkedDocumentId: string | null;
  /** The latest payment that still counts: its date and how it came (the timeline's "aa gaye 30 Jul · UPI"). */
  paidOn: string | null;
  method: string | null;
}

/**
 * The bills list (Stage 6): issued and cancelled bills newest first, with
 * what each still owes, filtered the way the chips say (Sab / Baaki / Aa
 * gaye / Cancel), searched by number or customer name. Credit notes come
 * with their bill, not as rows of their own.
 */
/** A search word inside ilike: %, _ and \\ are matched as themselves. */
function like(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** What a bill still owes, in SQL (the filter only; balanceOf in the engine is the figure shown). */
const OUTSTANDING = sql`((${schema.documents.totals}->>'totalPaise')::bigint
  - coalesce((select sum(p.amount_paise) from payments p where p.document_id = ${schema.documents.id} and p.reversed_at is null), 0)
  - coalesce((select sum((n.totals->>'totalPaise')::bigint) from documents n
               where n.linked_document_id = ${schema.documents.id} and n.kind = 'credit_note' and n.status = 'issued'), 0))`;

export async function listBills(
  scope: TenantScope,
  filter: {
    status?: BillFilter;
    q?: string;
    customerId?: string;
    seriesId?: string;
    limit?: number;
    /** Only bills dated on or after this day (Home's eight weeks). */
    since?: string;
  } = {},
): Promise<BillRow[]> {
  return withTenant(scope, async (tx) => {
    const q = filter.q?.trim();
    const rows = await tx.db
      .select({
        id: schema.documents.id,
        number: schema.documents.number,
        financialYear: schema.documents.financialYear,
        kind: schema.documents.kind,
        status: schema.documents.status,
        issueDate: schema.documents.issueDate,
        customerId: schema.documents.customerId,
        customerName: schema.documents.customerName,
        seriesId: schema.documents.seriesId,
        totalPaise: sql<number>`coalesce((${schema.documents.totals}->>'totalPaise')::bigint, 0)`.mapWith(Number),
        linkedDocumentId: schema.documents.linkedDocumentId,
      })
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.businessId, scope.businessId),
          ne(schema.documents.status, 'draft'),
          ne(schema.documents.kind, 'credit_note'),
          ...(filter.status === 'cancelled' ? [eq(schema.documents.status, 'cancelled')] : []),
          // Stage 10: dues and settled bills are chosen before the limit, so a business with more bills than the
          // limit still sees its oldest dues. The engine's balanceOf (below) still decides each row's status.
          ...(filter.status === 'due' || filter.status === 'paid'
            ? [
                eq(schema.documents.status, 'issued'),
                filter.status === 'due' ? sql`${OUTSTANDING} > 0` : sql`${OUTSTANDING} <= 0`,
              ]
            : []),
          ...(filter.customerId ? [eq(schema.documents.customerId, filter.customerId)] : []),
          ...(filter.seriesId ? [eq(schema.documents.seriesId, filter.seriesId)] : []),
          ...(filter.since ? [gte(schema.documents.issueDate, filter.since)] : []),
          ...(q
            ? [
                sql`(${schema.documents.search} @@ plainto_tsquery('simple', ${q}) or ${schema.documents.number} ilike ${like(q)} or ${schema.documents.customerName} ilike ${like(q)})`,
              ]
            : []),
        ),
      )
      .orderBy(desc(schema.documents.issueDate), desc(schema.documents.issuedAt))
      .limit(filter.limit ?? 500);
    const balances = await balancesIn(
      tx,
      rows.map((r) => r.id),
    );
    const paid = rows.length
      ? await tx.db
          .select({
            documentId: schema.payments.documentId,
            date: schema.payments.date,
            method: schema.payments.method,
          })
          .from(schema.payments)
          .where(
            and(
              inArray(
                schema.payments.documentId,
                rows.map((r) => r.id),
              ),
              eq(schema.payments.kind, 'payment'),
              isNull(schema.payments.reversedAt),
            ),
          )
          .orderBy(asc(schema.payments.date), asc(schema.payments.createdAt))
      : [];
    const lastPaid = new Map(paid.map((p) => [p.documentId, p]));
    const out = rows.map((r) => ({
      id: r.id,
      number: r.number ?? '',
      financialYear: r.financialYear,
      kind: r.kind as DocumentKindColumn,
      status: r.status as DocumentStatus,
      issueDate: r.issueDate,
      customerId: r.customerId,
      customerName: r.customerName,
      seriesId: r.seriesId,
      totalPaise: r.totalPaise,
      balance: balances.get(r.id)!,
      linkedDocumentId: r.linkedDocumentId,
      paidOn: lastPaid.get(r.id)?.date ?? null,
      method: lastPaid.get(r.id)?.method ?? null,
    }));
    if (filter.status === 'due') return out.filter((r) => r.balance.status === 'due' || r.balance.status === 'partial');
    if (filter.status === 'paid') return out.filter((r) => r.balance.status === 'paid');
    return out;
  });
}

/**
 * The worker's daily "aaj yaad dilao" list (no message is sent; the owner
 * decides): unpaid bills whose payment terms end today, and those already
 * past them. Terms are the business's default days (0: due on the bill date).
 */
export async function duesToday(
  scope: TenantScope,
  today: string,
  termsDays: number,
): Promise<{ dueToday: BillRow[]; overdue: BillRow[] }> {
  const open = await listBills(scope, { status: 'due' });
  return {
    dueToday: open.filter((r) => ageInDays(r.issueDate, today) === termsDays),
    overdue: open.filter((r) => ageInDays(r.issueDate, today) > termsDays),
  };
}

/** Everything the bill view shows: the document, what it owes, the money against it, its credit notes. */
export async function billView(scope: TenantScope, id: string) {
  return withTenant(scope, async (tx) => {
    const doc = (await tx.db.select().from(schema.documents).where(eq(schema.documents.id, id)))[0];
    if (!doc || doc.status === 'draft') throw new NotFoundError('document');
    const balance = (await balancesIn(tx, [doc.id])).get(doc.id)!;
    const entries = await tx.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.documentId, doc.id))
      .orderBy(asc(schema.payments.createdAt), asc(schema.payments.id));
    const creditNotes = await tx.db
      .select()
      .from(schema.documents)
      .where(and(eq(schema.documents.linkedDocumentId, doc.id), eq(schema.documents.kind, 'credit_note')))
      .orderBy(asc(schema.documents.createdAt), asc(schema.documents.id));
    const reminders = await tx.db
      .select({
        id: schema.remindersSent.id,
        tone: schema.remindersSent.tone,
        createdAt: schema.remindersSent.createdAt,
      })
      .from(schema.remindersSent)
      .where(eq(schema.remindersSent.documentId, doc.id))
      .orderBy(desc(schema.remindersSent.createdAt));
    return { document: asDocument(doc), balance, entries, creditNotes: creditNotes.map(asDocument), reminders };
  });
}

/**
 * The bill a URL names: its id, or its number and the year it belongs to (a
 * series without the year in its numbers starts again each April); a number
 * with no year finds the newest.
 */
export async function findBill(
  scope: TenantScope,
  idOrNumber: string,
  financialYear?: string | null,
): Promise<string | null> {
  return withTenant(scope, async ({ db }) => {
    const byId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrNumber);
    const row = (
      await db
        .select({ id: schema.documents.id })
        .from(schema.documents)
        .where(
          and(
            byId ? eq(schema.documents.id, idOrNumber) : eq(schema.documents.number, idOrNumber),
            ne(schema.documents.status, 'draft'),
            // The link names the year when it has one: last year's INV-001 is not this year's.
            ...(!byId && financialYear ? [eq(schema.documents.financialYear, financialYear)] : []),
          ),
        )
        .orderBy(desc(schema.documents.issueDate))
        .limit(1)
    )[0];
    return row?.id ?? null;
  });
}

/** The seller as the engine sees it now (the bill form's checks run the same assess() as the issue). */
export async function sellerNow(scope: TenantScope): Promise<IssueBusiness> {
  return withTenant(scope, async (tx) => sellerOf(await businessRow(tx)));
}

/** The customer's last issued bill, for "Pichle jaisa hi?": its lines as drafted again. */
export async function lastBillFor(scope: TenantScope, customerId: string): Promise<Document | null> {
  return withTenant(scope, async ({ db }) => {
    const row = (
      await db
        .select()
        .from(schema.documents)
        .where(
          and(
            eq(schema.documents.customerId, customerId),
            eq(schema.documents.status, 'issued'),
            ne(schema.documents.kind, 'credit_note'),
          ),
        )
        .orderBy(desc(schema.documents.issueDate), desc(schema.documents.issuedAt))
        .limit(1)
    )[0];
    return row ? asDocument(row) : null;
  });
}

/** The issued bills of one or many customers' latest dates, for the customer lists' order and dues. */
export async function documentsByIds(scope: TenantScope, ids: string[]): Promise<Document[]> {
  if (!ids.length) return [];
  return withTenant(scope, async ({ db }) =>
    (await db.select().from(schema.documents).where(inArray(schema.documents.id, ids))).map(asDocument),
  );
}

// --- probes for the generated tests (not part of the product API)
/**
 * An issued bill any business may make: no tax line, so a regular registrant
 * and a composition dealer both issue it. Used by the payments, reminders and
 * document-files probes.
 */
export async function probeIssuedBill(scope: TenantScope, name = 'Probe Customer'): Promise<string> {
  const owner = { ...scope, role: 'owner' as const };
  const d = await createDraft(owner, {
    customer: { name, stateCode: '27' },
    placeOfSupplyStateCode: '27',
    dateIso: '2026-10-15',
    gstOn: false,
    lines: [{ description: 'Probe work', quantityMilli: 1000, unitPricePaise: 100000, gstBp: 0, taxRateChosen: true }],
  });
  return (await issueDocument(owner, { id: d.id, today: '2026-10-15' })).id;
}
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
