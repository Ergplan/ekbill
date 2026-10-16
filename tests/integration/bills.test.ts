import { describe, expect, it } from 'vitest';

import type { IssueLine } from '../../packages/engine/src/index';
import { ForbiddenError, NotFoundError } from '../../packages/db/src/repos/allow';
import * as documents from '../../packages/db/src/repos/documents';
import * as payments from '../../packages/db/src/repos/payments';
import * as reminders from '../../packages/db/src/repos/reminders';
import { businessesWithBills } from '../../packages/db/src/system';
import { withTenant } from '../../packages/db/src/scope';
import { businessOf, scopeFor, seeded } from './helpers';

/**
 * Stage 6: money against a bill (the MVP's payment lifecycle, salvaged:
 * issue → part → full → reversal → balance), the roles on every write,
 * the bills list and its search, the seeded fixture bills, and the daily
 * dues listing. The balance is always the engine's balanceOf over rows.
 */
const TODAY = '2026-10-15';
const line = (description: string, pricePaise: number, gstBp = 1800): IssueLine => ({
  description,
  quantityMilli: 1000,
  unitPricePaise: pricePaise,
  gstBp,
  taxRateChosen: true,
  hsnCode: '9987',
});

async function issue(totalBeforeTaxPaise = 1000000, dateIso = '2026-10-10') {
  const owner = await scopeFor('sharma', 'owner');
  const d = await documents.createDraft(owner, {
    customer: { name: 'Lifecycle Traders', stateCode: '27', phone: '+919800000001' },
    dateIso,
    lines: [line('Wiring work', totalBeforeTaxPaise)],
  });
  return documents.issueDocument(owner, { id: d.id, today: TODAY });
}

seeded();

describe('the payment lifecycle (the MVP test, on v2)', () => {
  it('issue → part → write-off → full → reversal: the balance follows every row', async () => {
    const bill = await issue(); // ₹10,000 + 18 % = ₹11,800
    const owner = await scopeFor('sharma', 'owner');
    const staff = await scopeFor('sharma', 'staff');
    expect(await payments.balanceOfDocument(owner, bill.id)).toMatchObject({
      totalPaise: 1180000,
      duePaise: 1180000,
      status: 'due',
    });

    // Staff record money ("Paise aa gaye", part).
    const part = await payments.recordPayment(staff, {
      documentId: bill.id,
      amountPaise: 500000,
      dateIso: '2026-10-12',
      method: 'upi',
      today: TODAY,
    });
    expect(part.balance).toMatchObject({ paidPaise: 500000, duePaise: 680000, status: 'partial' });

    // The engine's checks, said as keys the screen renders.
    const refused = (amountPaise: number, dateIso: string, method = 'cash') =>
      payments.recordPayment(staff, { documentId: bill.id, amountPaise, dateIso, method, today: TODAY });
    await expect(refused(680001, '2026-10-12')).rejects.toMatchObject({ say: { key: 'pay.error.more' } });
    await expect(refused(100, '2026-10-16')).rejects.toMatchObject({ say: { key: 'pay.error.future' } });
    await expect(refused(100, '2026-10-09')).rejects.toMatchObject({ say: { key: 'pay.error.before' } });
    await expect(refused(100, '2026-10-12', 'barter')).rejects.toMatchObject({ say: { key: 'pay.error.method' } });
    await expect(refused(0, '2026-10-12')).rejects.toMatchObject({ say: { key: 'pay.error.amount' } });

    // "Kam karo" is the owner's; the accountant only reads.
    await expect(
      payments.recordAdjustment(staff, { documentId: bill.id, amountPaise: 100, dateIso: TODAY, today: TODAY }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const accountant = await scopeFor('sharma', 'accountant');
    await expect(
      payments.recordPayment(accountant, {
        documentId: bill.id,
        amountPaise: 100,
        dateIso: TODAY,
        method: 'cash',
        today: TODAY,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const off = await payments.recordAdjustment(owner, {
      documentId: bill.id,
      amountPaise: 80000,
      dateIso: TODAY,
      note: 'Discount for late start',
      today: TODAY,
    });
    expect(off.balance).toMatchObject({ adjustedPaise: 80000, duePaise: 600000, status: 'partial' });

    // The rest, in full.
    const full = await payments.recordPayment(staff, {
      documentId: bill.id,
      amountPaise: 600000,
      dateIso: TODAY,
      method: 'cash',
      today: TODAY,
    });
    expect(full.balance).toMatchObject({ duePaise: 0, status: 'paid' });

    // A mistaken entry is reversed by the owner, once, with a reason; it stays on the record.
    await expect(payments.reversePayment(staff, { paymentId: full.payment.id, reason: 'x' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(payments.reversePayment(owner, { paymentId: full.payment.id, reason: '  ' })).rejects.toMatchObject({
      say: { key: 'pay.error.reason' },
    });
    const back = await payments.reversePayment(owner, { paymentId: full.payment.id, reason: 'Cheque bounced' });
    expect(back.balance).toMatchObject({ duePaise: 600000, status: 'partial' });
    await expect(
      payments.reversePayment(owner, { paymentId: full.payment.id, reason: 'again' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    const entries = await payments.listPayments(owner, bill.id);
    expect(entries.map((e) => [e.kind, e.amountPaise, e.reversedAt !== null])).toEqual([
      ['payment', 500000, false],
      ['adjustment', 80000, false],
      ['payment', 600000, true],
    ]);
    // Undo the reversal's effect by paying again: balance 0 again.
    const again = await payments.recordPayment(owner, {
      documentId: bill.id,
      amountPaise: 600000,
      dateIso: TODAY,
      method: 'bank',
      today: TODAY,
    });
    expect(again.balance).toMatchObject({ duePaise: 0, status: 'paid', paidPaise: 1100000 });
  });

  it('a recorded entry is never changed or deleted, and money goes against issued bills only', async () => {
    const bill = await issue(200000);
    const owner = await scopeFor('sharma', 'owner');
    const { payment } = await payments.recordPayment(owner, {
      documentId: bill.id,
      amountPaise: 1000,
      dateIso: TODAY,
      method: 'upi',
      today: TODAY,
    });
    const raw = (sql: string, params: unknown[]) => withTenant(owner, ({ client }) => client.query(sql, params));
    await expect(raw('update payments set amount_paise = 1 where id = $1', [payment.id])).rejects.toThrow(
      /never changed/,
    );
    await expect(raw('delete from payments where id = $1', [payment.id])).rejects.toThrow();
    // A cancelled bill owes nothing and takes no money.
    await documents.cancelDocument(owner, { id: bill.id, reason: 'Wrong customer' });
    expect(await payments.balanceOfDocument(owner, bill.id)).toMatchObject({ duePaise: 0, status: 'cancelled' });
    await expect(
      payments.recordPayment(owner, {
        documentId: bill.id,
        amountPaise: 1,
        dateIso: TODAY,
        method: 'upi',
        today: TODAY,
      }),
    ).rejects.toMatchObject({ say: { key: 'pay.error.notIssued' } });
    // A draft takes none either (the trigger backs the repository).
    const draft = await documents.createDraft(owner, {
      customer: { name: 'Draft Only', stateCode: '27' },
      dateIso: TODAY,
      lines: [line('x', 100)],
    });
    await expect(
      raw(
        `insert into payments (business_id, document_id, kind, amount_paise, date, method, created_by)
         values ($1, $2, 'payment', 1, $3, 'upi', $4)`,
        [owner.businessId, draft.id, TODAY, owner.userId],
      ),
    ).rejects.toThrow(/issued bill only/);
  });

  it('a credit note reduces what is due; staff cannot make one', async () => {
    const bill = await issue(100000); // ₹1,180
    const owner = await scopeFor('sharma', 'owner');
    const note = await documents.createCreditNote(owner, {
      invoiceId: bill.id,
      dateIso: TODAY,
      reason: 'One fan returned',
      lines: [{ ...line('One fan returned', 59000), priceIncludesTax: true }],
    });
    await documents.issueDocument(owner, { id: note.id, today: TODAY });
    const b = await payments.balanceOfDocument(owner, bill.id);
    expect(b.creditedPaise).toBe(59000);
    expect(b.duePaise).toBe(118000 - 59000);
    const view = await documents.billView(owner, bill.id);
    expect(view.creditNotes.map((n) => n.notes)).toEqual(['One fan returned']);
  });
});

describe('the bills list (Stage 6 screens read this)', () => {
  it('holds the fixture bills, issued through issueDocument, with their payments and states', async () => {
    const owner = await scopeFor('sharma', 'owner');
    const all = await documents.listBills(owner);
    const byNumber = new Map(all.map((r) => [r.number, r]));
    // INV-031: ₹7,316 paid in full by UPI on 30 Jul (the fixture's numbers, the engine's totals).
    expect(byNumber.get('INV-031')).toMatchObject({
      totalPaise: 731600,
      balance: { status: 'paid', duePaise: 0 },
      paidOn: '2026-07-30',
      method: 'upi',
    });
    expect(byNumber.get('INV-034')?.balance.status).toBe('cancelled');
    expect(byNumber.get('INV-038')?.balance.creditedPaise).toBeGreaterThan(0);
    expect([...byNumber.keys()]).toEqual(expect.arrayContaining(['AMC-004', 'AMC-005', 'AMC-006']));
    // Credit notes travel with their bill, never as rows of their own.
    expect(all.some((r) => r.kind === 'credit_note')).toBe(false);
    const gupta = await documents.listBills(await scopeFor('gupta', 'staff'));
    expect(gupta.map((r) => r.number)).toEqual(expect.arrayContaining(['BOS-020', 'BOS-021', 'BOS-022']));
    expect(gupta.every((r) => r.kind === 'bill_of_supply')).toBe(true);
  });

  it('filters the way the chips say and searches by number or customer', async () => {
    const owner = await scopeFor('sharma', 'owner');
    const due = await documents.listBills(owner, { status: 'due' });
    expect(due.length).toBeGreaterThan(0);
    expect(due.every((r) => r.balance.status === 'due' || r.balance.status === 'partial')).toBe(true);
    const paid = await documents.listBills(owner, { status: 'paid' });
    expect(paid.every((r) => r.balance.status === 'paid')).toBe(true);
    const cancelled = await documents.listBills(owner, { status: 'cancelled' });
    expect(cancelled.map((r) => r.number)).toContain('INV-034');
    const mehta = await documents.listBills(owner, { q: 'mehta' });
    expect(mehta.length).toBeGreaterThan(0);
    expect(mehta.every((r) => /mehta/i.test(r.customerName))).toBe(true);
    expect((await documents.listBills(owner, { q: 'INV-031' })).map((r) => r.number)).toEqual(['INV-031']);
    // The URL names a bill by number or id; another business's number finds nothing.
    const id = await documents.findBill(owner, 'INV-031');
    expect(id).toBe(byNumberId(await documents.listBills(owner), 'INV-031'));
    expect(await documents.findBill(owner, id!)).toBe(id);
    expect(await documents.findBill(await scopeFor('gupta', 'owner'), 'INV-031')).toBeNull();
  });

  it('records a reminder against a bill (owner and staff), and the bill view counts it', async () => {
    const staff = await scopeFor('sharma', 'staff');
    const bill = await issue(50000);
    await reminders.recordReminder(staff, {
      documentId: bill.id,
      tone: 'gentle',
      language: 'hi-Latn',
      text: 'Namaste',
    });
    await expect(
      reminders.recordReminder(await scopeFor('sharma', 'accountant'), {
        documentId: bill.id,
        tone: 'gentle',
        language: 'en',
        text: 'Hello',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect((await documents.billView(staff, bill.id)).reminders).toHaveLength(1);
  });
});

describe('the daily dues listing (worker job dues-today)', () => {
  it('lists the businesses with bills, and per business what falls due today and what is past due', async () => {
    const all = await businessesWithBills();
    const sharma = businessOf('sharma');
    expect(all).toEqual(expect.arrayContaining([expect.objectContaining({ businessId: sharma.id })]));
    const owner = await scopeFor('sharma', 'owner');
    const bill = await issue(70000, '2026-10-01');
    const { dueToday, overdue } = await documents.duesToday(owner, '2026-10-15', 14);
    expect(dueToday.map((r) => r.id)).toContain(bill.id);
    expect(overdue.every((r) => r.issueDate < '2026-10-01')).toBe(true);
    const later = await documents.duesToday(owner, '2026-10-16', 14);
    expect(later.overdue.map((r) => r.id)).toContain(bill.id);
  });
});

function byNumberId(rows: documents.BillRow[], number: string): string | undefined {
  return rows.find((r) => r.number === number)?.id;
}
