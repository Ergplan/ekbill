import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSession } from '../../packages/db/src/auth';
import { getPool } from '../../packages/db/src/pool';
import * as documentFiles from '../../packages/db/src/repos/document-files';
import * as documents from '../../packages/db/src/repos/documents';
import * as photos from '../../packages/db/src/repos/photos';
import type { Role } from '../../packages/db/src/scope';
import { scopeFor, seeded } from './helpers';

/**
 * The server actions and route handlers as a request reaches them (rule 3; Stage 5–8 reviews: they were tested only
 * through the journeys). The session cookie is a real session of a seeded person, so `current()` resolves it the
 * way a request does; Next's cache and the queue are stubbed (the queue records what was sent, and can be down).
 */
const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: () => undefined,
    delete: () => undefined,
  }),
  headers: async () => new Headers(),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
const queue = vi.hoisted(() => ({ sent: [] as Array<{ name: string; data: Record<string, unknown> }>, down: false }));
vi.mock('../../apps/web/server/queue', () => ({
  enqueue: async (name: string, data: Record<string, unknown>) => {
    if (queue.down) throw new Error('queue down');
    queue.sent.push({ name, data });
    return 'job';
  },
}));

seeded();
beforeEach(() => {
  jar.clear();
  queue.sent.length = 0;
  queue.down = false;
});

async function signIn(who: 'sharma' | 'gupta', role: Role) {
  const scope = await scopeFor(who, role);
  const session = await createSession({ userId: scope.userId, businessId: scope.businessId });
  jar.set('eb-session', session.id);
  return scope;
}
const tag = () => String(Date.now()).slice(-6) + Math.random().toString(36).slice(2, 5);
const line = (rate: string, gstRate: number | null = 18) => ({ what: 'Wiring', qty: '1', rate, gstRate });

describe('bill actions', () => {
  it('a credit note is printed and queued after issue, like a bill (Stage 6 review)', async () => {
    const owner = await signIn('sharma', 'owner');
    const { issueBill, makeCreditNote } = await import('../../apps/web/actions/bills');
    const bill = await issueBill({
      customerName: `Credit Print ${tag()}`,
      customerState: '27',
      issueDate: '2026-10-15',
      gstOn: true,
      lines: [line('1000')],
    });
    expect(bill.ok).toBe(true);
    queue.sent.length = 0;
    const note = await makeCreditNote({ linkedDocumentId: bill.ok ? bill.value.id : '', amount: '100', notes: 'Kam' });
    expect(note.ok).toBe(true);
    const id = note.ok ? note.value.id : '';
    expect((await documentFiles.renderingsOf(owner, id)).length).toBe(1);
    expect(queue.sent.map((j) => j.name)).toEqual(['render-other-sizes', 'index-search']);
    expect(queue.sent[0]!.data).toMatchObject({ documentId: id });
  });

  it('a refused new-customer bill tried again adds the customer once (Stage 6 review)', async () => {
    await signIn('sharma', 'staff');
    const { issueBill } = await import('../../apps/web/actions/bills');
    const name = `Retry Once ${tag()}`;
    // GST on and no rate chosen: refused, and the draft and the new customer stay.
    const first = await issueBill({
      customerName: name,
      customerState: '27',
      issueDate: '2026-10-15',
      gstOn: true,
      lines: [line('500', null)],
    });
    expect(first.ok).toBe(false);
    const draftId = first.ok ? null : (first.draftId ?? null);
    expect(draftId).not.toBeNull();
    const again = await issueBill({
      id: draftId,
      customerName: name,
      customerState: '27',
      issueDate: '2026-10-15',
      gstOn: true,
      lines: [line('500')],
    });
    expect(again.ok).toBe(true);
    const rows = (await getPool().query('select id from customers where name = $1', [name])).rows;
    expect(rows).toHaveLength(1);
    const owner = await scopeFor('sharma', 'owner');
    expect((await documents.getDocument(owner, again.ok ? again.value.id : '')).customerId).toBe(rows[0].id);
  });

  it('cancel and credit are the owner’s; the accountant records no money', async () => {
    const owner = await scopeFor('sharma', 'owner');
    const bill = await documents.issueDocument(owner, {
      id: (
        await documents.createDraft(owner, {
          customer: { name: `Roles ${tag()}`, stateCode: '27' },
          dateIso: '2026-10-15',
          lines: [
            { description: 'Gate', quantityMilli: 1000, unitPricePaise: 90000, gstBp: 1800, taxRateChosen: true },
          ],
        })
      ).id,
      today: '2026-10-15',
    });
    const { cancelBill, makeCreditNote, recordMoney } = await import('../../apps/web/actions/bills');
    await signIn('sharma', 'staff');
    expect(await cancelBill({ id: bill.id, cancelledReason: 'galat' })).toMatchObject({
      ok: false,
      error: 'auth.forbidden',
    });
    expect(await makeCreditNote({ linkedDocumentId: bill.id, amount: '10', notes: 'x' })).toMatchObject({
      ok: false,
      error: 'auth.forbidden',
    });
    await signIn('sharma', 'accountant');
    expect(
      await recordMoney({ documentId: bill.id, kind: 'payment', amount: '100', date: '2026-10-15', method: 'upi' }),
    ).toMatchObject({ ok: false, error: 'auth.forbidden' });
  });

  it('signed out, every action says so', async () => {
    const { issueBill } = await import('../../apps/web/actions/bills');
    expect(
      await issueBill({ customerName: 'X', issueDate: '2026-10-15', gstOn: false, lines: [line('1')] }),
    ).toMatchObject({
      ok: false,
      error: 'auth.signed.out',
    });
  });
});

describe('people actions', () => {
  it('an import id that is not one is refused before anything is read', async () => {
    await signIn('sharma', 'owner');
    const { commitImport } = await import('../../apps/web/actions/people');
    expect(await commitImport({ importId: 'not-a-uuid', rowIds: [] })).toMatchObject({
      ok: false,
      error: 'form.invalid',
    });
  });

  it('staff do not archive a customer', async () => {
    const owner = await scopeFor('sharma', 'owner');
    const id = (await getPool().query('select id from customers where business_id = $1 limit 1', [owner.businessId]))
      .rows[0].id;
    await signIn('sharma', 'staff');
    const { setCustomerArchived } = await import('../../apps/web/actions/people');
    expect(await setCustomerArchived({ id, archived: true })).toMatchObject({ ok: false, error: 'auth.forbidden' });
  });
});

describe('upload routes', () => {
  const form = (field: string, name: string, type: string, bytes: Uint8Array<ArrayBuffer>) => {
    const f = new FormData();
    f.append(field, new File([bytes], name, { type }));
    return f;
  };
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);

  it('photos: signed out 401; queue down 503 and the reading set aside; else 202 and queued', async () => {
    const { POST } = await import('../../apps/web/app/api/photos/route');
    const post = () =>
      POST(
        new Request('http://127.0.0.1/api/photos', {
          method: 'POST',
          body: form('photo', 'b.jpg', 'image/jpeg', jpeg),
        }),
      );
    expect((await post()).status).toBe(401);
    const staff = await signIn('sharma', 'staff');
    queue.down = true;
    const down = await post();
    expect(down.status).toBe(503);
    expect(await down.json()).toEqual({ error: 'photo.error.queue' });
    const { rows } = await getPool().query(
      'select status from extractions where business_id = $1 order by created_at desc limit 1',
      [staff.businessId],
    );
    expect(rows[0].status).toBe('discarded');
    queue.down = false;
    const ok = await post();
    expect(ok.status).toBe(202);
    const { id } = (await ok.json()) as { id: string };
    expect(queue.sent).toEqual([
      expect.objectContaining({ name: 'read-bill', data: expect.objectContaining({ extractionId: id }) }),
    ]);
    expect((await photos.getExtraction(staff, id)).status).toBe('pending');
  });

  it('imports: the accountant 403, no files 400, queue down 503 and the import failed', async () => {
    const { POST } = await import('../../apps/web/app/api/imports/route');
    const csv = new TextEncoder().encode('Name\nAsha\n');
    const post = (f: FormData) => POST(new Request('http://127.0.0.1/api/imports', { method: 'POST', body: f }));
    await signIn('sharma', 'accountant');
    expect((await post(form('files', 'p.csv', 'text/csv', csv))).status).toBe(403);
    const owner = await signIn('sharma', 'owner');
    expect((await post(new FormData())).status).toBe(400);
    queue.down = true;
    const down = await post(form('files', 'p.csv', 'text/csv', csv));
    expect(down.status).toBe(503);
    const { rows } = await getPool().query(
      'select status, error from imports where business_id = $1 order by created_at desc limit 1',
      [owner.businessId],
    );
    expect(rows[0]).toEqual({ status: 'failed', error: 'queue' });
  });

  it('a photo’s image: an id that is not one, or another business’s, is not found', async () => {
    const { GET } = await import('../../apps/web/app/api/extractions/[id]/image/route');
    const get = (id: string) =>
      GET(new Request(`http://127.0.0.1/api/extractions/${id}/image`), { params: Promise.resolve({ id }) });
    const gupta = await scopeFor('gupta', 'owner');
    const theirs = await photos.startRead(gupta, { name: 'g.jpg', mime: 'image/jpeg', bytes: jpeg });
    await signIn('sharma', 'owner');
    expect((await get('-'.repeat(36))).status).toBe(404);
    expect((await get(theirs.extractionId)).status).toBe(404);
  });
});

describe('the CA pack route', () => {
  it('staff 403; more than twelve months 400; a month the wrong way round 400', async () => {
    const { GET } = await import('../../apps/web/app/api/gst/pack/route');
    const get = (q: string) => GET(new Request(`http://127.0.0.1/api/gst/pack?${q}`));
    await signIn('sharma', 'staff');
    expect((await get('from=2026-09&to=2026-09')).status).toBe(403);
    await signIn('sharma', 'owner');
    expect((await get('from=2025-04&to=2026-04')).status).toBe(400);
    expect((await get('from=2026-09&to=2026-08')).status).toBe(400);
  });
});

describe('Home', () => {
  it('the last three bills are there with none in the eight weeks (Stage 10 review)', async () => {
    await signIn('sharma', 'owner');
    const { getViewer } = await import('../../apps/web/screens/viewer');
    const { loadHome } = await import('../../apps/web/screens/home/data');
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2027-09-01T06:00:00Z'));
      const home = await loadHome(await getViewer());
      expect(home.sentThisMonth).toBe(0);
      expect(home.sparkline.every((n) => n === 0)).toBe(true);
      expect(home.recent).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
