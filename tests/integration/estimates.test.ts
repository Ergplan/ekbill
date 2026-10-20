import { describe, expect, it } from 'vitest';

import type { IssueLine } from '../../packages/engine/src/index';
import { NotFoundError } from '../../packages/db/src/repos/allow';
import * as billLinks from '../../packages/db/src/repos/bill-links';
import * as documents from '../../packages/db/src/repos/documents';
import * as gst from '../../packages/db/src/repos/gst';
import * as payments from '../../packages/db/src/repos/payments';
import * as plan from '../../packages/db/src/repos/plan';
import * as reminders from '../../packages/db/src/repos/reminders';
import { withTenant } from '../../packages/db/src/scope';
import { scopeFor, seeded } from './helpers';

/**
 * Kaccha bills (20 Oct): an estimate is numbered in its own series and issued through issueDocument, but it is
 * no sale: never in the bills list, dues, GST, the plan's count, money or reminders. A pakka bill made from it
 * links back. And a bill's own link (the WhatsApp message carries it) opens that one document, no session needed.
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
const kamal = { name: 'Kamal Sweets', stateCode: '27', address: 'Sitabuldi, Nagpur', phone: null };

describe('kaccha bills (estimates)', () => {
  seeded();

  it('number in their own series and count nowhere: not a bill, not GST, not the plan, no money', async () => {
    const owner = { ...(await scopeFor('sharma', 'owner')), requestId: `estimate-${Date.now()}` };
    const before = (await plan.planOf(owner, TODAY)).billsIssued;
    const draft = await documents.createDraft(owner, {
      customer: kamal,
      dateIso: TODAY,
      estimate: true,
      lines: [line('Shop wiring', 900000)],
    });
    expect(draft.kind).toBe('estimate');
    const est = await documents.issueDocument(owner, { id: draft.id, today: TODAY });
    expect(est.kind).toBe('estimate');
    expect(est.number).toMatch(/^EST-\d{3}$/);
    expect(est.issuedSnapshot!.title).toBe('ESTIMATE');
    expect(est.issuedSnapshot!.legend).toMatch(/not a tax invoice/);
    // The GST it would carry is shown, worked out by the engine.
    expect(est.totals!.gstPaise).toBe(162000);

    expect((await plan.planOf(owner, TODAY)).billsIssued).toBe(before);
    expect((await documents.listBills(owner)).map((b) => b.id)).not.toContain(est.id);
    expect((await documents.listBills(owner, { status: 'due' })).map((b) => b.id)).not.toContain(est.id);
    const kaccha = await documents.listBills(owner, { estimates: true });
    expect(kaccha.find((b) => b.id === est.id)).toMatchObject({ kind: 'estimate', pakkaNumber: null });
    const w = await gst.workingsFor(owner, ['2026-10']);
    expect(w.documents.map((d) => d.id)).not.toContain(est.id);

    await expect(
      payments.recordPayment(owner, {
        documentId: est.id,
        amountPaise: 1000,
        dateIso: TODAY,
        method: 'upi',
        today: TODAY,
      }),
    ).rejects.toBeInstanceOf(payments.PaymentError);
    await expect(
      documents.createCreditNote(owner, { invoiceId: est.id, dateIso: TODAY, lines: [line('Back', 1000)] }),
    ).rejects.toMatchObject({ code: 'not-a-bill' });
    await expect(
      reminders.recordReminder(owner, { documentId: est.id, tone: 'gentle', language: 'hi-Latn', text: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    // The database says the same, whatever the repository does: money only against a bill.
    await expect(
      withTenant(owner, ({ client }) =>
        client.query(
          `insert into payments (business_id, document_id, kind, amount_paise, date, method, created_by)
           values ($1, $2, 'payment', 1000, $3, 'upi', $4)`,
          [owner.businessId, est.id, TODAY, owner.userId],
        ),
      ),
    ).rejects.toThrow(/issued bill only/);
  });

  it('becomes a pakka bill with one tap: the bill links back to it, and it says which bill it became', async () => {
    const staff = { ...(await scopeFor('sharma', 'staff')), requestId: `pakka-${Date.now()}` };
    const draft = await documents.createDraft(staff, {
      customer: kamal,
      dateIso: TODAY,
      estimate: true,
      lines: [line('Fan fitting', 120000)],
    });
    const est = await documents.issueDocument(staff, { id: draft.id, today: TODAY });
    const billDraft = await documents.createDraft(staff, {
      customer: kamal,
      dateIso: TODAY,
      lines: [line('Fan fitting', 120000)],
      fromEstimateId: est.id,
    });
    const bill = await documents.issueDocument(staff, { id: billDraft.id, today: TODAY });
    expect(bill.kind).toBe('tax_invoice');
    expect(bill.number).toMatch(/^INV-/);
    expect(bill.fromEstimateId).toBe(est.id);

    const estView = await documents.billView(staff, est.id);
    expect(estView.pakka.map((p) => p.number)).toEqual([bill.number]);
    expect((await documents.billView(staff, bill.id)).estimate?.number).toBe(est.number);
    const kaccha = await documents.listBills(staff, { estimates: true });
    expect(kaccha.find((b) => b.id === est.id)?.pakkaNumber).toBe(bill.number);

    // Only an issued estimate is made into a bill; a bill is not an estimate.
    await expect(
      documents.createDraft(staff, {
        customer: kamal,
        dateIso: TODAY,
        lines: [line('A', 100)],
        fromEstimateId: bill.id,
      }),
    ).rejects.toMatchObject({ code: 'not-an-estimate' });
    // The trigger holds it too: a draft cannot be pointed at a bill by hand.
    await expect(
      withTenant(staff, ({ client }) =>
        client.query('update documents set from_estimate_id = $1 where id = $2', [bill.id, billDraft.id]),
      ),
    ).rejects.toThrow();
    // And once issued, the link is part of the bill: it never changes.
    await expect(
      withTenant(staff, ({ client }) =>
        client.query('update documents set from_estimate_id = null where id = $1', [bill.id]),
      ),
    ).rejects.toThrow(/cannot be changed/);
  });

  it('a cancelled estimate makes no pakka bill, and is not redone', async () => {
    const owner = { ...(await scopeFor('sharma', 'owner')), requestId: `est-cancel-${Date.now()}` };
    const d = await documents.createDraft(owner, {
      customer: kamal,
      dateIso: TODAY,
      estimate: true,
      lines: [line('A', 5000)],
    });
    const est = await documents.issueDocument(owner, { id: d.id, today: TODAY });
    await documents.cancelDocument(owner, { id: est.id, reason: 'Customer ne mana kiya' });
    await expect(
      documents.createDraft(owner, {
        customer: kamal,
        dateIso: TODAY,
        lines: [line('A', 5000)],
        fromEstimateId: est.id,
      }),
    ).rejects.toMatchObject({ code: 'not-an-estimate' });
    await expect(
      documents.createDraft(owner, { customer: kamal, dateIso: TODAY, lines: [line('A', 5000)], replaces: est.id }),
    ).rejects.toMatchObject({ code: 'not-a-bill' });
  });
});

describe('a bill’s own link', () => {
  seeded();

  it('is one per bill, opens that bill alone with no session, and a made-up token opens nothing', async () => {
    const staff = await scopeFor('sharma', 'staff');
    const id = await documents.probeIssuedBill({ ...staff, role: 'owner' }, 'Link Customer');
    const token = await billLinks.linkFor(staff, id);
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(await billLinks.linkFor(staff, id)).toBe(token);
    const opened = await billLinks.openLink(token, 'link-test');
    expect(opened).toMatchObject({ businessId: staff.businessId, documentId: id });
    expect(await billLinks.openLink('A'.repeat(22), 'link-test')).toBeNull();
    expect(await billLinks.openLink('not a token', 'link-test')).toBeNull();
    // A draft has no link (nothing has gone to the customer).
    const draft = await documents.createDraft(staff, { customer: kamal, dateIso: TODAY, lines: [line('A', 100)] });
    await expect(billLinks.linkFor(staff, draft.id)).rejects.toBeInstanceOf(NotFoundError);
    // The accountant reads; sharing is the shop's.
    await expect(billLinks.linkFor(await scopeFor('sharma', 'accountant'), id)).rejects.toThrow(/may not/);
    // With no business set, the table shows nothing but the row its token names.
    const seen = await withTenant({ ...staff, businessId: '00000000-0000-4000-9000-000000000099' }, ({ client }) =>
      client.query('select count(*)::int as n from bill_links'),
    );
    expect(seen.rows[0].n).toBe(0);
  });
});
