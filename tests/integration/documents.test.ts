import { describe, expect, it } from 'vitest';

import { computeTax, type IssueLine, type IssuedSnapshot } from '../../packages/engine/src/index';
import { ForbiddenError, NotFoundError } from '../../packages/db/src/repos/allow';
import * as documents from '../../packages/db/src/repos/documents';
import * as series from '../../packages/db/src/repos/series';
import { withTenant, type TenantScope } from '../../packages/db/src/scope';
import { businessOf, scopeFor, seeded } from './helpers';

/**
 * Issuance (I2): draft → issued through the one writer, refusals, cancel,
 * credit notes that link back, the immutability trigger, the audit rows.
 */
const TODAY = '2026-10-15';
const line = (description: string, pricePaise: number, gstBp = 1800, extra: Partial<IssueLine> = {}): IssueLine => ({
  description,
  quantityMilli: 1000,
  unitPricePaise: pricePaise,
  gstBp,
  taxRateChosen: true,
  hsnCode: '9987',
  ...extra,
});
const mehta = {
  name: 'Mehta Traders',
  gstin: '27AABCG1234H1ZZ',
  stateCode: '27',
  address: '12, Dharampeth, Nagpur',
  phone: '+919876543210',
};
const draftInput = (patch: Partial<documents.DraftInput> = {}): documents.DraftInput => ({
  customer: mehta,
  dateIso: TODAY,
  lines: [line('AMC visit', 350000), line('Ceiling fan', 135000, 1800, { quantityMilli: 2000 })],
  ...patch,
});

async function auditRows(scope: TenantScope, requestId: string) {
  return withTenant(scope, async ({ client }) => {
    const r = await client.query(
      'select table_name, action, row_id, before, after from audit_events where business_id = $1 and request_id = $2 order by id',
      [scope.businessId, requestId],
    );
    return r.rows as Array<{ table_name: string; action: string; row_id: string; before: unknown; after: unknown }>;
  });
}

describe('issueDocument: the one writer (I2)', () => {
  seeded();

  it('turns a draft into an issued tax invoice with a number, a snapshot and the engine totals', async () => {
    const scope = { ...(await scopeFor('sharma', 'staff')), requestId: `issue-${Date.now()}` };
    const draft = await documents.createDraft(scope, draftInput());
    expect(draft.status).toBe('draft');
    expect(draft.number).toBeNull();
    expect(draft.kind).toBe('tax_invoice');
    expect(draft.totals?.totalPaise).toBe(731600); // 6,200 + 18 % = ₹7,316.00, the running figure

    const issued = await documents.issueDocument(scope, { id: draft.id, today: TODAY });
    expect(issued.status).toBe('issued');
    expect(issued.kind).toBe('tax_invoice');
    expect(issued.number).toMatch(/^INV-\d{3}$/);
    expect(issued.financialYear).toBe('2026-27');
    expect(issued.issuedAt).toBeInstanceOf(Date);
    const snapshot = issued.issuedSnapshot!;
    expect(snapshot.version).toBe(1);
    expect(snapshot.title).toBe('TAX INVOICE');
    expect(snapshot.seller.legalName).toBe('Sharma Electricals');
    expect(snapshot.seller.gstin).toBe('27AAAAA0000A1Z2');
    expect(snapshot.customer.gstin).toBe(mehta.gstin);
    expect(snapshot.rulePackVersion).toMatch(/^\d{4}\.\d{2}\.\d{2}/);
    expect(snapshot.rulesApplied).toEqual(expect.arrayContaining(['place-of-supply-state', 'document-kinds-2017']));
    // The totals are the engine's, nothing else's.
    const direct = computeTax({
      lines: draftInput().lines,
      registration: 'regular',
      gstOn: true,
      dateIso: TODAY,
      sellerStateCode: '27',
      customerStateCode: '27',
    });
    expect(issued.totals?.totalPaise).toBe(direct.totalPaise);
    expect(snapshot.totals.cgstPaise).toBe(direct.cgstPaise);
    expect(snapshot.totals.totalPaise).toBe(731600);
    // The series moved on by one.
    const s = await series.getSeries(scope, issued.seriesId);
    expect(s.fy).toBe('2026-27');
    expect(`INV-${String(s.nextNumber - 1).padStart(3, '0')}`).toBe(issued.number);
  });

  it('refuses the engine blockers and spends no number', async () => {
    const scope = await scopeFor('sharma', 'owner');
    const before = (await series.listSeries(scope, { kind: 'bill' }))[0]!;
    const draft = await documents.createDraft(
      scope,
      draftInput({ lines: [line('Unpriced work', 100000, 0, { taxRateChosen: false })] }),
    );
    const attempt = documents.issueDocument(scope, { id: draft.id, today: TODAY });
    await expect(attempt).rejects.toBeInstanceOf(documents.IssueRefusedError);
    await attempt.catch((e: documents.IssueRefusedError) => {
      expect(e.blockers.map((b) => b.code)).toContain('rate-not-chosen');
      expect(e.blockers[0]!.message.key).toMatch(/^assess\./);
    });
    const still = await documents.getDocument(scope, draft.id);
    expect(still.status).toBe('draft');
    expect(still.number).toBeNull();
    const after = (await series.listSeries(scope, { kind: 'bill' }))[0]!;
    expect(after.nextNumber).toBe(before.nextNumber);
  });

  it('refuses a draft of a business that has not said whether it is registered', async () => {
    const scope = await scopeFor('verma', 'owner');
    const draft = await documents.createDraft(scope, draftInput({ customer: { name: 'Walk-in' } }));
    await expect(documents.issueDocument(scope, { id: draft.id, today: TODAY })).rejects.toMatchObject({
      name: 'IssueRefusedError',
      blockers: expect.arrayContaining([expect.objectContaining({ code: 'gst-status-unconfirmed' })]),
    });
  });

  it('issues a composition business a bill of supply with the legend and no tax', async () => {
    const scope = await scopeFor('gupta', 'staff');
    const draft = await documents.createDraft(
      scope,
      draftInput({
        customer: { name: 'Walk-in', stateCode: '09' },
        lines: [line('Atta 10 kg', 45000, 0, { hsnCode: null })],
      }),
    );
    expect(draft.kind).toBe('bill_of_supply');
    const issued = await documents.issueDocument(scope, { id: draft.id, today: TODAY });
    expect(issued.kind).toBe('bill_of_supply');
    expect(issued.number).toMatch(/^BOS-\d{3}$/);
    expect(issued.issuedSnapshot!.title).toBe('BILL OF SUPPLY');
    expect(issued.issuedSnapshot!.legend).toContain('not eligible to collect tax');
    expect(issued.totals!.gstPaise).toBe(0);
    expect(issued.totals!.totalPaise).toBe(45000);
  });

  it('cannot issue twice, and cannot issue what is not a draft', async () => {
    const scope = await scopeFor('sharma', 'owner');
    const draft = await documents.createDraft(scope, draftInput());
    await documents.issueDocument(scope, { id: draft.id, today: TODAY });
    await expect(documents.issueDocument(scope, { id: draft.id, today: TODAY })).rejects.toMatchObject({
      name: 'DocumentStateError',
      code: 'not-a-draft',
    });
  });

  it('cancels an issued bill (owner only), never a draft, and never twice', async () => {
    const owner = await scopeFor('sharma', 'owner');
    const staff = await scopeFor('sharma', 'staff');
    const draft = await documents.createDraft(staff, draftInput());
    await expect(documents.cancelDocument(owner, { id: draft.id, reason: 'x' })).rejects.toMatchObject({
      code: 'not-issued',
    });
    const issued = await documents.issueDocument(staff, { id: draft.id, today: TODAY });
    await expect(documents.cancelDocument(staff, { id: issued.id, reason: 'galat' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const cancelled = await documents.cancelDocument(owner, { id: issued.id, reason: 'Galat customer' });
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.number).toBe(issued.number);
    expect(cancelled.cancelledAt).toBeInstanceOf(Date);
    expect(cancelled.cancelledReason).toBe('Galat customer');
    expect(cancelled.issuedSnapshot).toEqual(issued.issuedSnapshot);
    await expect(documents.cancelDocument(owner, { id: issued.id, reason: 'again' })).rejects.toMatchObject({
      code: 'not-issued',
    });
  });

  it('credits an issued invoice with a note in its own series that links back', async () => {
    const owner = await scopeFor('sharma', 'owner');
    const invoice = await documents.issueDocument(owner, {
      id: (await documents.createDraft(owner, draftInput())).id,
      today: TODAY,
    });
    const note = await documents.createCreditNote(owner, {
      invoiceId: invoice.id,
      dateIso: TODAY,
      lines: [line('Ceiling fan returned', 135000)],
      reason: 'Ek fan wapas',
    });
    expect(note.kind).toBe('credit_note');
    expect(note.status).toBe('draft');
    expect(note.linkedDocumentId).toBe(invoice.id);
    expect(note.customerGstin).toBe(mehta.gstin);
    const issuedNote = await documents.issueDocument(owner, { id: note.id, today: TODAY });
    expect(issuedNote.number).toMatch(/^CN-\d{3}$/);
    const snapshot = issuedNote.issuedSnapshot as IssuedSnapshot;
    expect(snapshot.kind).toBe('credit-note');
    expect(snapshot.title).toBe('CREDIT NOTE');
    expect(snapshot.linkedInvoice).toEqual({ id: invoice.id, number: invoice.number, dateIso: TODAY });
    expect(snapshot.totals.totalPaise).toBe(159300); // 1,350 + 18 %
    // The credited invoice is corrected, not cancelled.
    await expect(documents.cancelDocument(owner, { id: invoice.id, reason: 'x' })).rejects.toMatchObject({
      code: 'credit-note-exists',
    });
    // A credit note cannot be drafted against a draft or a cancelled bill; staff cannot make one.
    const draft = await documents.createDraft(owner, draftInput());
    await expect(
      documents.createCreditNote(owner, { invoiceId: draft.id, dateIso: TODAY, lines: [line('x', 100)] }),
    ).rejects.toMatchObject({ code: 'not-issued' });
    const staff = await scopeFor('sharma', 'staff');
    await expect(
      documents.createCreditNote(staff, { invoiceId: invoice.id, dateIso: TODAY, lines: [line('x', 100)] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  // Stage 11 review: the limit was checked before the transaction, on a bill nothing locked.
  it('credits no more than the bill, even two notes at once; never a credit note; staff cannot rewrite one', async () => {
    const owner = await scopeFor('sharma', 'owner');
    const invoice = await documents.issueDocument(owner, {
      id: (await documents.createDraft(owner, draftInput({ lines: [line('Panel', 100000)] }))).id,
      today: TODAY,
    });
    expect(invoice.totals!.totalPaise).toBe(118000);
    const full = () =>
      documents.createCreditNote(owner, {
        invoiceId: invoice.id,
        dateIso: TODAY,
        lines: [line('All of it', 118000, 1800, { priceIncludesTax: true })],
      });
    const [a, b] = await Promise.all([full(), full()]);
    const outcomes = await Promise.allSettled([
      documents.issueDocument(owner, { id: a.id, today: TODAY }),
      documents.issueDocument(owner, { id: b.id, today: TODAY }),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const refused = outcomes.find((o) => o.status === 'rejected') as PromiseRejectedResult;
    expect(refused.reason).toMatchObject({
      name: 'IssueRefusedError',
      blockers: [expect.objectContaining({ code: 'credit-more-than-bill' })],
    });
    // A credit note is not a bill to credit.
    const issuedNote = (outcomes.find((o) => o.status === 'fulfilled') as PromiseFulfilledResult<documents.Document>)
      .value;
    await expect(
      documents.createCreditNote(owner, { invoiceId: issuedNote.id, dateIso: TODAY, lines: [line('x', 100)] }),
    ).rejects.toMatchObject({ code: 'not-a-bill' });
    // The refused note is still a draft: staff can neither rewrite nor issue it.
    const staff = await scopeFor('sharma', 'staff');
    const leftover = outcomes[0]!.status === 'rejected' ? a : b;
    await expect(documents.updateDraft(staff, leftover.id, { lines: [line('x', 1)] })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(documents.issueDocument(staff, { id: leftover.id, today: TODAY })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('is immutable once issued: the trigger refuses every change to what the customer saw', async () => {
    const scope = await scopeFor('sharma', 'owner');
    const issued = await documents.issueDocument(scope, {
      id: (await documents.createDraft(scope, draftInput())).id,
      today: TODAY,
    });
    const change = (set: string, params: unknown[] = []) =>
      withTenant(scope, ({ client }) =>
        client.query(`update documents set ${set} where id = $1`, [issued.id, ...params]),
      );
    await expect(change("number = 'INV-999'")).rejects.toThrow(/cannot be changed/);
    await expect(change("lines = '[]'::jsonb")).rejects.toThrow(/cannot be changed/);
    await expect(change("totals = '{}'::jsonb")).rejects.toThrow(/cannot be changed/);
    await expect(change("issued_snapshot = '{}'::jsonb")).rejects.toThrow(/cannot be changed/);
    await expect(change('issued_at = now()')).rejects.toThrow(/cannot be changed/);
    await expect(change("customer_name = 'Someone else'")).rejects.toThrow(/cannot be changed/);
    await expect(change("status = 'draft'")).rejects.toThrow(/cannot go back/);
    await expect(change('id = gen_random_uuid()')).rejects.toThrow();
    // Nothing is deleted (8.3).
    await expect(
      withTenant(scope, ({ client }) => client.query('delete from documents where id = $1', [issued.id])),
    ).rejects.toThrow();
    // What may still change: the IRN once, the due date, the notes.
    await change("irn = 'IRN-TEST-1'");
    await expect(change("irn = 'IRN-TEST-2'")).rejects.toThrow(/already carries an IRN/);
    await change("due_date = '2026-11-15', notes = 'paid by UPI'");
    // A draft's lines may still change through the repository (revision goes up).
    const draft = await documents.createDraft(scope, draftInput());
    const edited = await documents.updateDraft(scope, draft.id, { lines: [line('One thing', 10000)] });
    expect(edited.revision).toBe(draft.revision + 1);
    expect(edited.totals!.totalPaise).toBe(11800);
    await expect(documents.updateDraft(scope, issued.id, { notes: 'x' })).rejects.toMatchObject({
      code: 'not-a-draft',
    });
  });

  it('refuses status = issued from anything but issueDocument (the issue gate)', async () => {
    const scope = await scopeFor('sharma', 'owner');
    const draft = await documents.createDraft(scope, draftInput());
    await expect(
      withTenant(scope, ({ client }) =>
        client.query(
          "update documents set status = 'issued', number = 'X-1', financial_year = '2026-27', issued_at = now(), issued_snapshot = '{}'::jsonb where id = $1",
          [draft.id],
        ),
      ),
    ).rejects.toThrow(/only issueDocument/);
    await expect(
      withTenant(scope, ({ client }) =>
        client.query(
          `insert into documents (business_id, series_id, kind, status, number, financial_year, issue_date, customer_name, issued_at, issued_snapshot, created_by)
           values ($1, $2, 'tax_invoice', 'issued', 'X-2', '2026-27', $3, 'Nobody', now(), '{}'::jsonb, $4)`,
          [scope.businessId, draft.seriesId, TODAY, scope.userId],
        ),
      ),
    ).rejects.toThrow(/only issueDocument/);
  });

  it('audits the issue: one row for the document and one for the series, under the request id', async () => {
    const scope = { ...(await scopeFor('sharma', 'owner')), requestId: `audit-issue-${Date.now()}` };
    const draft = await documents.createDraft(scope, draftInput());
    const issued = await documents.issueDocument(scope, { id: draft.id, today: TODAY });
    const rows = await auditRows(scope, scope.requestId);
    expect(rows.map((r) => `${r.table_name}:${r.action}`)).toEqual([
      'documents:INSERT',
      'series:UPDATE',
      'documents:UPDATE',
    ]);
    const issue = rows[2]!;
    expect(issue.row_id).toBe(issued.id);
    expect((issue.before as { status: string }).status).toBe('draft');
    expect((issue.after as { status: string; number: string }).status).toBe('issued');
    expect((issue.after as { number: string }).number).toBe(issued.number);
    const alloc = rows[1]!;
    expect((alloc.after as { next_number: number }).next_number).toBe(
      (alloc.before as { next_number: number }).next_number + 1,
    );
  });

  it('a model may not issue (I6), and another business sees nothing of it (I1)', async () => {
    const scope = await scopeFor('sharma', 'owner');
    const draft = await documents.createDraft(scope, draftInput());
    // drizzle reports the failed query and keeps Postgres's message in the cause.
    const rootMessage = (e: unknown): string => {
      let x = e as { message?: string; cause?: unknown } | undefined;
      let last = '';
      while (x) {
        last = x.message ?? last;
        x = x.cause as typeof x;
      }
      return last;
    };
    await expect(
      documents.issueDocument({ ...scope, actorKind: 'model' }, { id: draft.id, today: TODAY }),
    ).rejects.toSatisfy((e) => /model may not write/.test(rootMessage(e)));
    const gupta = await scopeFor('gupta', 'owner');
    await expect(documents.getDocument(gupta, draft.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(documents.issueDocument(gupta, { id: draft.id, today: TODAY })).rejects.toBeInstanceOf(NotFoundError);
    expect(businessOf('gupta').id).not.toBe(scope.businessId);
  });
});
