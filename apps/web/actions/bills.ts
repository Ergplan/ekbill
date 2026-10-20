'use server';

import { revalidatePath } from 'next/cache';

import {
  ForbiddenError,
  NotFoundError,
  businesses,
  photos,
  plan,
  customers,
  documents,
  items,
  payments,
  reminders,
  type TenantScope,
} from '@ekbill/db';
import {
  correctionsFrom,
  creditNoteLines,
  fromGstin,
  parseMoney,
  parseQuantity,
  todayIst,
  type BillLook,
  type CheckedReading,
  type IssueLine,
  type IssuedSnapshot,
  type Say,
} from '@ekbill/engine';
import { printAndKeep } from '@ekbill/render';

import { log } from '../server/log';
import { paymentsOn } from '../server/plan-config';
import { enqueue } from '../server/queue';
import { current } from '../server/session';
import type { z } from 'zod';

import {
  cancelBillInput,
  photoBillInput,
  creditNoteBillInput,
  issueBillInput,
  paymentInput,
  reminderInput,
  reversalInput,
} from './schema';

/**
 * Stage 6's writes: the bill (drafted and issued in one tap, I2), cancel,
 * credit note, money against a bill and the reminder opened. Each
 * validates the shape (zod), calls the repositories (which hold the roles
 * and run the engine), and answers ok or a refusal the screen can say: a
 * dictionary key, with the engine's blockers when it said no.
 */
export interface Refusal {
  ok: false;
  error: string;
  say?: Say;
  field?: string;
  /** The engine's blockers (assess.*), each with what to do. */
  blockers?: Array<{ code: string; key: string; params?: Record<string, string | number> }>;
  /** The draft a refused issue left, sent back with the next attempt so one bill is one draft. */
  draftId?: string;
}
export type BillResult<T> = { ok: true; value: T } | Refusal;

async function scoped(): Promise<{ scope: TenantScope } | { error: string }> {
  const me = await current();
  if (!me) return { error: 'auth.signed.out' };
  if (!me.scope) return { error: 'auth.no.business' };
  return { scope: me.scope };
}

function refused(e: unknown, draftId?: string): Refusal {
  if (e instanceof documents.IssueRefusedError)
    return {
      ok: false,
      error: 'bill.refused',
      blockers: e.blockers.map((b) => ({ code: b.code, key: b.message.key, params: b.message.params })),
      draftId,
    };
  if (e instanceof documents.DocumentStateError) return { ok: false, error: `bill.state.${e.code}`, draftId };
  if (e instanceof plan.PlanError) return { ok: false, error: e.key, draftId };
  if (e instanceof payments.PaymentError) return { ok: false, error: e.say.key, say: e.say };
  if (e instanceof customers.CustomerError) return { ok: false, error: e.say.key, field: e.field, say: e.say };
  if (e instanceof photos.PhotoError) return { ok: false, error: `photo.error.${e.code}` };
  if (e instanceof ForbiddenError) return { ok: false, error: 'auth.forbidden' };
  if (e instanceof NotFoundError) return { ok: false, error: 'error.notFound' };
  throw e;
}

function touched(...paths: string[]) {
  for (const p of ['/', '/bills', '/dues', '/customers', ...paths]) revalidatePath(p);
}

/** The lines as typed, parsed by the engine; blank rows dropped; HSN/SAC from the item of the same name. */
async function linesFrom(
  scope: TenantScope,
  typed: Array<{ what: string; qty: string; rate: string; gstRate: number | null }>,
  gstOn: boolean,
): Promise<IssueLine[] | Refusal> {
  const known = await items.listItems(scope);
  // The item's HSN and unit go on the line (the printed quantity column and GSTR-1's UQC read the unit).
  const itemOf = (what: string) => known.find((i) => i.name.trim().toLowerCase() === what.trim().toLowerCase());
  const out: IssueLine[] = [];
  for (const [i, l] of typed.entries()) {
    if (!l.what.trim() && !l.rate.trim()) continue;
    let quantityMilli: number;
    let unitPricePaise: number;
    try {
      quantityMilli = parseQuantity(l.qty || '1');
      unitPricePaise = parseMoney(l.rate || '0');
    } catch {
      return { ok: false, error: 'bill.check.amount', field: `line-${i}` };
    }
    out.push({
      description: l.what.trim(),
      quantityMilli,
      unitPricePaise,
      gstBp: gstOn && l.gstRate !== null ? Math.round(l.gstRate * 100) : 0,
      taxRateChosen: !gstOn || l.gstRate !== null,
      hsnCode: itemOf(l.what)?.hsnSac ?? null,
      unit: itemOf(l.what)?.unit ?? null,
    });
  }
  if (!out.length) return { ok: false, error: 'bill.check.empty' };
  return out;
}

/**
 * "Bill banao": the customer (an existing row, or a new one the form named),
 * a draft (or the draft a refused attempt left), issueDocument(), then the
 * format the business shares rendered and kept at once (budget 3 s) and
 * the other sizes queued for the worker.
 */
export async function issueBill(
  input: unknown,
): Promise<BillResult<{ id: string; number: string; renderMs: number | null }>> {
  const parsed = issueBillInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'form.invalid' };
  const s = await scoped();
  if ('error' in s) return { ok: false, error: s.error };
  return issueFrom(s.scope, parsed.data);
}

type IssueBillData = z.infer<typeof issueBillInput>;

/** The one issue path of the screens (the form and the photo review): customer, draft, issueDocument, the file. */
/**
 * After an issue (a bill or a credit note): the shared format printed and kept at once (budget 3 s), the other
 * sizes queued for the worker, and Poocho's index brought up to date. Answers the print's time, or null when it
 * failed (the file is then printed on the first download). Stage 6 review: a credit note had none of this.
 */
async function afterIssue(
  scope: TenantScope,
  documentId: string,
  look: Pick<BillLook, 'shareAs' | 'paper'>,
): Promise<number | null> {
  let renderMs: number | null = null;
  try {
    const t0 = Date.now();
    await printAndKeep(scope, { documentId, kind: look.shareAs, paper: look.paper });
    renderMs = Date.now() - t0;
  } catch (error) {
    log.warn({ requestId: scope.requestId, documentId, err: error }, 'issue-time render failed');
  }
  await enqueue('render-other-sizes', {
    documentId,
    businessId: scope.businessId,
    userId: scope.userId,
    role: scope.role,
    requestId: scope.requestId,
  }).catch((error: unknown) => log.warn({ err: error }, 'render-other-sizes not queued'));
  await enqueue('index-search', {
    businessId: scope.businessId,
    userId: scope.userId,
    requestId: scope.requestId,
  }).catch((error: unknown) => log.warn({ err: error }, 'index-search not queued'));
  return renderMs;
}

async function issueFrom(
  scope: TenantScope,
  d: IssueBillData,
  /** Told the draft's id as soon as it exists (the photo's claim records it). */
  onDraft?: (draftId: string) => Promise<void>,
): Promise<BillResult<{ id: string; number: string; renderMs: number | null }>> {
  const today = todayIst(new Date());
  let draftId = d.id ?? undefined;
  try {
    const profile = await businesses.getProfile(scope);
    // Lines first: a form the server refuses must not leave a customer behind it.
    const lines = await linesFrom(scope, d.lines, d.gstOn);
    if (!Array.isArray(lines)) return lines;
    // A retry of a refused attempt for a new name: the customer that attempt made is this bill's, not a second one.
    let customerId = d.customerId ?? null;
    if (!customerId && draftId) {
      const draft = await documents.getDocument(scope, draftId);
      if (draft.customerId && draft.customerName.trim() === d.customerName.trim()) customerId = draft.customerId;
    }
    let customer;
    if (customerId) {
      const row = await customers.getCustomer(scope, customerId);
      customer = {
        id: row.id,
        name: row.name,
        gstin: row.gstin,
        stateCode: d.customerState ?? row.stateCode,
        address: [row.address, row.city].filter(Boolean).join(', ') || null,
        phone: row.phone,
      };
    } else {
      const gst = d.customerGstin ? fromGstin(d.customerGstin) : null;
      const row = await customers.createCustomer(scope, {
        name: d.customerName,
        phone: d.customerPhone ?? null,
        gstin: d.customerGstin ?? null,
        stateCode: gst?.stateCode ?? d.customerState ?? null,
        language: d.customerLanguage ?? null,
        languageSource: d.customerLanguage ? 'owner' : null,
      });
      customer = {
        id: row.id,
        name: row.name,
        gstin: row.gstin,
        stateCode: d.customerState ?? row.stateCode,
        address: null,
        phone: row.phone,
      };
    }
    // A walk-in with no state on record buys at the counter (the seller's state); a tax invoice asks (CheckStrip).
    const placeOfSupply =
      customer.stateCode ?? (d.gstOn && profile.registrationType === 'regular' ? null : profile.stateCode);
    const draftInput = {
      seriesId: d.seriesId ?? null,
      customer,
      dateIso: d.issueDate,
      gstOn: d.gstOn,
      lines,
      placeOfSupplyStateCode: placeOfSupply,
      replaces: d.estimate ? null : (d.replaces ?? null),
      fromEstimateId: d.estimate ? null : (d.fromEstimateId ?? null),
    };
    // A draft is a kaccha bill or a pakka one from its first save: a retry keeps what it was.
    const draft = draftId
      ? await documents.updateDraft(scope, draftId, draftInput)
      : await documents.createDraft(scope, { ...draftInput, estimate: d.estimate === true });
    if (onDraft) await onDraft(draft.id);
    draftId = draft.id;
    // EkBill's own fee (20 Oct): enforced once the operator takes payments (EKBILL_UPI_ID set).
    const issued = await documents.issueDocument(scope, { id: draft.id, today, enforcePlan: paymentsOn() });
    const renderMs = await afterIssue(scope, issued.id, profile.look);
    log.info({ requestId: scope.requestId, documentId: issued.id, number: issued.number, renderMs }, 'bill issued');
    touched();
    return { ok: true, value: { id: issued.id, number: issued.number ?? '', renderMs } };
  } catch (e) {
    return refused(e, draftId);
  }
}

/** Cancel (owner only): the bill stays, marked cancelled with the reason; "dobara banao" starts a new one. */
export async function cancelBill(input: unknown): Promise<BillResult<{ number: string }>> {
  const parsed = cancelBillInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'form.invalid' };
  const s = await scoped();
  if ('error' in s) return { ok: false, error: s.error };
  try {
    const doc = await documents.cancelDocument(s.scope, { id: parsed.data.id, reason: parsed.data.cancelledReason });
    log.info({ requestId: s.scope.requestId, documentId: doc.id }, 'bill cancelled');
    touched();
    return { ok: true, value: { number: doc.number ?? '' } };
  } catch (e) {
    return refused(e);
  }
}

/**
 * A credit note (owner only) for an amount against an issued bill. The
 * amount is split over the bill's rates in the bill's own proportion, each
 * part tax-inclusive, so the GST it reverses matches the GST the bill charged.
 */
export async function makeCreditNote(input: unknown): Promise<BillResult<{ id: string; number: string }>> {
  const parsed = creditNoteBillInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'form.invalid' };
  const s = await scoped();
  if ('error' in s) return { ok: false, error: s.error };
  const { scope } = s;
  let amountPaise: number;
  try {
    amountPaise = parseMoney(parsed.data.amount);
  } catch {
    return { ok: false, error: 'credit.error.amount', field: 'amount' };
  }
  try {
    const view = await documents.billView(scope, parsed.data.linkedDocumentId);
    const bill = view.document;
    const snapshot = bill.issuedSnapshot as IssuedSnapshot | null;
    const creditable = view.balance.totalPaise - view.balance.creditedPaise;
    if (!snapshot || amountPaise <= 0 || amountPaise > creditable)
      return { ok: false, error: 'credit.error.amount', field: 'amount' };
    const lines = creditNoteLines(snapshot.lines, amountPaise, parsed.data.notes);
    const today = todayIst(new Date());
    const note = await documents.createCreditNote(scope, {
      invoiceId: bill.id,
      dateIso: today,
      reason: parsed.data.notes,
      lines,
    });
    try {
      const issued = await documents.issueDocument(scope, { id: note.id, today });
      const renderMs = await afterIssue(scope, issued.id, (await businesses.getProfile(scope)).look);
      log.info({ requestId: scope.requestId, documentId: issued.id, invoice: bill.id, renderMs }, 'credit note issued');
      touched();
      return { ok: true, value: { id: issued.id, number: issued.number ?? '' } };
    } catch (e) {
      return refused(e, note.id);
    }
  } catch (e) {
    return refused(e);
  }
}

/** "Paise aa gaye" (owner and staff) or "Kam karo" (owner): the engine checks the amount against what is due. */
export async function recordMoney(input: unknown): Promise<BillResult<{ duePaise: number; status: string }>> {
  const parsed = paymentInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'form.invalid' };
  const s = await scoped();
  if ('error' in s) return { ok: false, error: s.error };
  const d = parsed.data;
  let amountPaise: number;
  try {
    amountPaise = parseMoney(d.amount);
  } catch {
    return { ok: false, error: 'pay.error.amount', field: 'amount' };
  }
  const today = todayIst(new Date());
  try {
    const r =
      d.kind === 'payment'
        ? await payments.recordPayment(s.scope, {
            documentId: d.documentId,
            amountPaise,
            dateIso: d.date,
            method: d.method ?? '',
            note: d.note ?? null,
            today,
          })
        : await payments.recordAdjustment(s.scope, {
            documentId: d.documentId,
            amountPaise,
            dateIso: d.date,
            note: d.note ?? null,
            today,
          });
    log.info({ requestId: s.scope.requestId, documentId: d.documentId, kind: d.kind }, 'money recorded');
    touched();
    return { ok: true, value: { duePaise: r.balance.duePaise, status: r.balance.status } };
  } catch (e) {
    return refused(e);
  }
}

/** A mistaken entry undone (owner only); it stays on the record, struck through. */
export async function reverseMoney(input: unknown): Promise<BillResult<{ duePaise: number }>> {
  const parsed = reversalInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'form.invalid' };
  const s = await scoped();
  if ('error' in s) return { ok: false, error: s.error };
  try {
    const r = await payments.reversePayment(s.scope, {
      paymentId: parsed.data.id,
      reason: parsed.data.reversalReason,
    });
    touched();
    return { ok: true, value: { duePaise: r.balance.duePaise } };
  } catch (e) {
    return refused(e);
  }
}

/** The reminder the owner opened in WhatsApp, kept so the bill shows "yaad dilaya" (the app never sends). */
export async function reminderOpened(input: unknown): Promise<BillResult<undefined>> {
  const parsed = reminderInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'form.invalid' };
  const s = await scoped();
  if ('error' in s) return { ok: false, error: s.error };
  try {
    await reminders.recordReminder(s.scope, parsed.data);
    return { ok: true, value: undefined };
  } catch (e) {
    return refused(e);
  }
}

/**
 * "Bill banao" on the photo review (Stage 7): the reviewed fields go down
 * Stage 6's issue path; once the bill is issued, the owner's changes are
 * kept as corrections (model value, human value) and the reading points at
 * the bill. A refused issue keeps nothing but the draft, as on the form.
 */
export async function makeBillFromPhoto(
  input: unknown,
): Promise<BillResult<{ id: string; number: string; renderMs: number | null }>> {
  const parsed = photoBillInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'form.invalid' };
  const s = await scoped();
  if ('error' in s) return { ok: false, error: s.error };
  // The screen's own list of corrections is not taken: the server works them out (Stage 11 review).
  const { extractionId, corrections: _fromScreen, ...bill } = parsed.data;
  // The reading is claimed first: one photo makes one bill, however many taps or reloads (Stage 11 review).
  let claim: Awaited<ReturnType<typeof photos.claimReading>>;
  try {
    claim = await photos.claimReading(s.scope, extractionId);
  } catch (e) {
    return refused(e);
  }
  if (!claim.claimed) {
    // Already made: the same bill again, not a second one.
    const doc = await documents.getDocument(s.scope, claim.documentId);
    return { ok: true, value: { id: doc.id, number: doc.number ?? '', renderMs: null } };
  }
  let made: Awaited<ReturnType<typeof issueFrom>>;
  try {
    made = await issueFrom(s.scope, { ...bill, id: claim.draftId ?? bill.id }, (draftId) =>
      photos.markClaimDraft(s.scope, extractionId, draftId),
    );
  } catch (e) {
    await photos.releaseReading(s.scope, extractionId).catch(() => undefined);
    throw e;
  }
  if (!made.ok) {
    await photos.releaseReading(s.scope, extractionId).catch(() => undefined);
    return made;
  }
  try {
    const reading = await photos.getExtraction(s.scope, extractionId);
    const corrections = reading.result ? correctionsFrom(reading.result as CheckedReading, bill) : [];
    await photos.finishReading(s.scope, extractionId, corrections, made.value.id);
  } catch (e) {
    // The bill is issued; a reading that cannot be committed (set aside meanwhile) does not undo it.
    log.warn({ requestId: s.scope.requestId, extractionId, err: e }, 'reading not committed');
  }
  log.info({ requestId: s.scope.requestId, extractionId, documentId: made.value.id }, 'bill made from a photo');
  return made;
}
