import { and, desc, eq } from 'drizzle-orm';

import type { ReminderTone } from '@ekbill/engine';

import * as schema from '../schema';
import { withTenant, type Role, type TenantScope } from '../scope';
import { allow, NotFoundError, type RoleProbe, type TenancyProbe } from './allow';

/**
 * "Yaad dilao" (Stage 6): the app writes the words and opens WhatsApp; the
 * owner sends. What was opened is recorded, so the next reminder can be
 * the second one and the bill shows when the customer was last asked.
 */
export type ReminderSent = typeof schema.remindersSent.$inferSelect;

export const allowedRoles = {
  recordReminder: ['owner', 'staff'],
} as const satisfies Record<string, readonly Role[]>;

export async function recordReminder(
  scope: TenantScope,
  input: { documentId: string; tone: ReminderTone; language: string; text: string },
): Promise<ReminderSent> {
  allow(scope, allowedRoles.recordReminder, 'send a reminder');
  return withTenant(scope, async ({ db }) => {
    const doc = (
      await db
        .select({
          id: schema.documents.id,
          customerId: schema.documents.customerId,
          status: schema.documents.status,
          kind: schema.documents.kind,
        })
        .from(schema.documents)
        .where(eq(schema.documents.id, input.documentId))
    )[0];
    // A kaccha bill owes nothing: there is nothing to remind about (20 Oct).
    if (!doc || doc.status !== 'issued' || doc.kind === 'estimate') throw new NotFoundError('document');
    const [row] = await db
      .insert(schema.remindersSent)
      .values({
        businessId: scope.businessId,
        documentId: doc.id,
        customerId: doc.customerId,
        tone: input.tone,
        language: input.language,
        text: input.text.slice(0, 2000),
        createdBy: scope.userId,
      })
      .returning();
    return row!;
  });
}

export async function remindersFor(scope: TenantScope, documentId: string): Promise<ReminderSent[]> {
  return withTenant(scope, async ({ db }) =>
    db
      .select()
      .from(schema.remindersSent)
      .where(
        and(eq(schema.remindersSent.documentId, documentId), eq(schema.remindersSent.businessId, scope.businessId)),
      )
      .orderBy(desc(schema.remindersSent.createdAt)),
  );
}

// --- probes for the generated tests (not part of the product API)
async function probeBill(scope: TenantScope): Promise<string> {
  const { probeIssuedBill } = await import('./documents');
  return probeIssuedBill(scope, 'Probe Reminded');
}
export const roleProbes: Record<keyof typeof allowedRoles, RoleProbe> = {
  recordReminder: async (scope) =>
    recordReminder(scope, { documentId: await probeBill(scope), tone: 'gentle', language: 'hi-Latn', text: 'Namaste' }),
};
export const tenancyProbes: TenancyProbe[] = [
  {
    name: "recordReminder cannot reach another business's bill",
    run: async (scope, other) => {
      const theirs = await probeBill({ ...scope, businessId: other.businessId, userId: other.userId });
      try {
        await recordReminder(scope, { documentId: theirs, tone: 'gentle', language: 'hi-Latn', text: 'x' });
        return { touched: [other.businessId] };
      } catch (e) {
        if (e instanceof NotFoundError) return { touched: [scope.businessId] };
        throw e;
      }
    },
  },
];
