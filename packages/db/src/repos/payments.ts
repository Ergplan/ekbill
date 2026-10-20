import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { balanceOf, checkEntry, type Balance, type LedgerEntry, type LedgerKind, type Say } from '@ekbill/engine';

import * as schema from '../schema';
import { withTenant, type Role, type TenantScope, type Tx } from '../scope';
import { allow, NotFoundError, type RoleProbe, type TenancyProbe } from './allow';

/**
 * Money against a bill (Stage 6). Staff record a payment ("Paise aa gaye",
 * full or part); only the owner writes an amount off ("Kam karo") or
 * reverses an entry. What is due is the engine's balanceOf, computed from
 * the rows every time; nothing stores a balance that could drift.
 */
export type Payment = typeof schema.payments.$inferSelect;

export class PaymentError extends Error {
  constructor(public readonly say: Say) {
    super(`payment: ${say.key}`);
    this.name = 'PaymentError';
  }
}

export const allowedRoles = {
  recordPayment: ['owner', 'staff'],
  recordAdjustment: ['owner'],
  reversePayment: ['owner'],
} as const satisfies Record<string, readonly Role[]>;

/** A document's total from its totals, without reading the rest of the JSON. */
const TOTAL_PAISE = sql<number | null>`(${schema.documents.totals}->>'totalPaise')::bigint`.mapWith(Number);

/** The balance of each issued bill asked for, in one query each for entries and credit notes. */
export async function balancesIn(tx: Tx, documentIds: string[]): Promise<Map<string, Balance>> {
  const out = new Map<string, Balance>();
  if (!documentIds.length) return out;
  const docs = await tx.db
    .select({ id: schema.documents.id, status: schema.documents.status, totalPaise: TOTAL_PAISE })
    .from(schema.documents)
    .where(inArray(schema.documents.id, documentIds));
  const entries = await tx.db
    .select({
      id: schema.payments.id,
      documentId: schema.payments.documentId,
      kind: schema.payments.kind,
      amountPaise: schema.payments.amountPaise,
      reversedAt: schema.payments.reversedAt,
    })
    .from(schema.payments)
    .where(inArray(schema.payments.documentId, documentIds));
  const notes = await tx.db
    .select({ linked: schema.documents.linkedDocumentId, totalPaise: TOTAL_PAISE })
    .from(schema.documents)
    .where(
      and(
        inArray(schema.documents.linkedDocumentId, documentIds),
        eq(schema.documents.kind, 'credit_note'),
        eq(schema.documents.status, 'issued'),
      ),
    );
  // Grouped once (Stage 10: a list of 500 bills must not scan every payment per bill).
  const entriesOf = new Map<string, LedgerEntry[]>();
  for (const e of entries) {
    const list = entriesOf.get(e.documentId) ?? [];
    list.push({ id: e.id, kind: e.kind as LedgerKind, amountPaise: e.amountPaise, reversed: e.reversedAt !== null });
    entriesOf.set(e.documentId, list);
  }
  const notesOf = new Map<string, number[]>();
  for (const n of notes)
    if (n.linked) notesOf.set(n.linked, [...(notesOf.get(n.linked) ?? []), Number(n.totalPaise ?? 0)]);
  for (const d of docs) {
    out.set(
      d.id,
      balanceOf({
        totalPaise: Number(d.totalPaise ?? 0),
        status: d.status as 'issued' | 'cancelled' | 'draft',
        entries: entriesOf.get(d.id) ?? [],
        creditNotesPaise: notesOf.get(d.id) ?? [],
      }),
    );
  }
  return out;
}

export async function balanceOfDocument(scope: TenantScope, documentId: string): Promise<Balance> {
  return withTenant(scope, async (tx) => {
    const b = (await balancesIn(tx, [documentId])).get(documentId);
    if (!b) throw new NotFoundError('document');
    return b;
  });
}

export async function listPayments(scope: TenantScope, documentId: string): Promise<Payment[]> {
  return withTenant(scope, async ({ db }) =>
    db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.documentId, documentId))
      .orderBy(asc(schema.payments.createdAt), asc(schema.payments.id)),
  );
}

async function record(
  scope: TenantScope,
  input: {
    documentId: string;
    kind: LedgerKind;
    amountPaise: number;
    dateIso: string;
    method?: string | null;
    note?: string | null;
    today: string;
  },
): Promise<{ payment: Payment; balance: Balance }> {
  return withTenant(scope, async (tx) => {
    // The bill's row is locked so two people recording the last payment at once cannot both pass the check.
    const doc = (
      await tx.db.select().from(schema.documents).where(eq(schema.documents.id, input.documentId)).for('update')
    )[0];
    if (!doc) throw new NotFoundError('document');
    // Not a credit note, and not a kaccha bill (20 Oct): its money comes with the pakka bill made from it.
    if (doc.status !== 'issued' || doc.kind === 'credit_note' || doc.kind === 'estimate')
      throw new PaymentError({ key: 'pay.error.notIssued' });
    const before = (await balancesIn(tx, [doc.id])).get(doc.id)!;
    const problem = checkEntry({
      kind: input.kind,
      amountPaise: input.amountPaise,
      duePaise: before.duePaise,
      dateIso: input.dateIso,
      issueDate: doc.issueDate,
      today: input.today,
      method: input.method,
    });
    if (problem) throw new PaymentError(problem);
    const [row] = await tx.db
      .insert(schema.payments)
      .values({
        businessId: scope.businessId,
        documentId: doc.id,
        kind: input.kind,
        amountPaise: input.amountPaise,
        date: input.dateIso,
        method: input.kind === 'payment' ? input.method : null,
        note: input.note?.trim() || null,
        createdBy: scope.userId,
      })
      .returning();
    const balance = (await balancesIn(tx, [doc.id])).get(doc.id)!;
    return { payment: row!, balance };
  });
}

/** "Paise aa gaye": full ("Poore") or part ("Kuch hissa"), with the date and how. */
export async function recordPayment(
  scope: TenantScope,
  input: {
    documentId: string;
    amountPaise: number;
    dateIso: string;
    method: string;
    note?: string | null;
    today: string;
  },
) {
  allow(scope, allowedRoles.recordPayment, 'record a payment');
  return record(scope, { ...input, kind: 'payment' });
}

/** "Kam karo": an amount the owner will not collect, written off against the bill (not a credit note). */
export async function recordAdjustment(
  scope: TenantScope,
  input: { documentId: string; amountPaise: number; dateIso: string; note?: string | null; today: string },
) {
  allow(scope, allowedRoles.recordAdjustment, 'write off an amount');
  return record(scope, { ...input, kind: 'adjustment', method: null });
}

/** A mistaken entry undone, once, with a reason; the entry stays on the record. */
export async function reversePayment(
  scope: TenantScope,
  input: { paymentId: string; reason: string },
): Promise<{ payment: Payment; balance: Balance }> {
  allow(scope, allowedRoles.reversePayment, 'reverse a payment');
  const reason = input.reason.trim();
  if (!reason) throw new PaymentError({ key: 'pay.error.reason' });
  return withTenant(scope, async (tx) => {
    const [row] = await tx.db
      .update(schema.payments)
      .set({ reversedAt: sql`now()`, reversedBy: scope.userId, reversalReason: reason.slice(0, 200) })
      .where(and(eq(schema.payments.id, input.paymentId), isNull(schema.payments.reversedAt)))
      .returning();
    if (!row) throw new NotFoundError('payment');
    const balance = (await balancesIn(tx, [row.documentId])).get(row.documentId)!;
    return { payment: row, balance };
  });
}

// --- probes for the generated tests (not part of the product API)
async function probeBill(scope: TenantScope): Promise<string> {
  const { probeIssuedBill } = await import('./documents');
  return probeIssuedBill(scope, 'Probe Payer');
}
export const roleProbes: Record<keyof typeof allowedRoles, RoleProbe> = {
  recordPayment: async (scope) =>
    recordPayment(scope, {
      documentId: await probeBill(scope),
      amountPaise: 1000,
      dateIso: '2026-10-15',
      method: 'cash',
      today: '2026-10-15',
    }),
  recordAdjustment: async (scope) =>
    recordAdjustment(scope, {
      documentId: await probeBill(scope),
      amountPaise: 1000,
      dateIso: '2026-10-15',
      today: '2026-10-15',
    }),
  reversePayment: async (scope) => {
    const owner = { ...scope, role: 'owner' as const };
    const { payment } = await recordPayment(owner, {
      documentId: await probeBill(scope),
      amountPaise: 1000,
      dateIso: '2026-10-15',
      method: 'upi',
      today: '2026-10-15',
    });
    return reversePayment(scope, { paymentId: payment.id, reason: 'probe' });
  },
};
export const tenancyProbes: TenancyProbe[] = [
  {
    name: "recordPayment cannot reach another business's bill",
    run: async (scope, other) => {
      const theirs = await probeBill({ ...scope, businessId: other.businessId, userId: other.userId });
      try {
        await recordPayment(scope, {
          documentId: theirs,
          amountPaise: 1000,
          dateIso: '2026-10-15',
          method: 'cash',
          today: '2026-10-15',
        });
        return { touched: [other.businessId] };
      } catch (e) {
        if (e instanceof NotFoundError) return { touched: [scope.businessId] };
        throw e;
      }
    },
  },
  {
    name: "listPayments sees nothing of another business's bill",
    run: async (scope, other) => {
      const them = { ...scope, businessId: other.businessId, userId: other.userId, role: 'owner' as const };
      const theirs = await probeBill(them);
      await recordPayment(them, {
        documentId: theirs,
        amountPaise: 1000,
        dateIso: '2026-10-15',
        method: 'cash',
        today: '2026-10-15',
      });
      const mine = await listPayments(scope, theirs);
      return { touched: mine.length ? [other.businessId] : [scope.businessId] };
    },
  },
];
