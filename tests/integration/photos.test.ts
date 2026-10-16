import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { setTransport } from '../../packages/ai/src/index';
import { ForbiddenError } from '../../packages/db/src/repos/allow';
import * as aiCalls from '../../packages/db/src/repos/ai-calls';
import * as documents from '../../packages/db/src/repos/documents';
import * as photos from '../../packages/db/src/repos/photos';
import { withTenant, type TenantScope } from '../../packages/db/src/scope';
import { runReadBill } from '../../apps/worker/src/read-bill/job';
import type { CheckedReading } from '../../packages/engine/src/index';
import { scopeFor, seeded } from './helpers';

/**
 * Stage 7: a photographed bill through the worker's read-bill job (the fake
 * model, which answers the synthetic set's ground truth), the extraction it
 * writes as the model, the ai_calls row with its cost, the review's
 * corrections and the commit; and I6 at the database: a model writes the
 * reading and nothing else.
 */
const DIR = join(__dirname, '..', 'fixtures', 'bills');
const photo = (name: string) => readFileSync(join(DIR, 'synthetic', `${name}.jpg`));
const NOW = new Date('2026-10-15T06:00:00Z');

seeded();
beforeAll(() => {
  process.env.AI_TRANSPORT = 'fake';
  process.env.AI_FAKE_DIR = join(DIR, 'fake');
  process.env.OPENAI_VISION_PRICE_IN = '2.5';
  process.env.OPENAI_VISION_PRICE_OUT = '10';
});
afterAll(() => {
  delete process.env.AI_TRANSPORT;
  delete process.env.OPENAI_VISION_PRICE_IN;
  delete process.env.OPENAI_VISION_PRICE_OUT;
  setTransport(null);
});

/** The database's own words under drizzle's "Failed query" wrapper. */
async function rootMessage(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'resolved';
  } catch (e) {
    let x = e as { cause?: unknown; message?: string };
    while (x.cause) x = x.cause as typeof x;
    return x.message ?? String(x);
  }
}

async function read(scope: TenantScope, name: string) {
  const { extractionId } = await photos.startRead(scope, {
    name: `${name}.jpg`,
    mime: 'image/jpeg',
    bytes: photo(name),
  });
  const outcome = await runReadBill(
    { extractionId, businessId: scope.businessId, userId: scope.userId, role: scope.role, requestId: `read-${name}` },
    NOW,
  );
  return { extractionId, outcome, row: await photos.getExtraction(scope, extractionId) };
}

describe('read-bill: a photo into an extraction (staging only, I6)', () => {
  it('staff upload a kaccha bill; the worker reads it, the engine checks it, the call is costed', async () => {
    const staff = await scopeFor('sharma', 'staff');
    const { extractionId, outcome, row } = await read(staff, 'kaccha-03'); // Joshi Builders, Doorbell ×4 + ×1, ₹1,670
    expect(outcome).toBe('ready');
    expect(row).toMatchObject({ status: 'ready', error: null, model: 'fake-reader', promptVersion: 'read-bill/v1' });
    const result = row.result as CheckedReading;
    expect(result.customer.value).toBe('Joshi Builders');
    expect(result.date.value).toBe('2026-08-23');
    expect(result.lines.map((l) => [l.what.value, l.qty.value, l.rate.value])).toEqual([
      ['Doorbell', '4', '340'],
      ['Doorbell', '1', '310'],
    ]);
    expect(result.linesTotalPaise).toBe(167000);
    expect(result.totalsDiffer).toBe(false);
    // Matched to the seeded customer by name.
    expect(row.matchedCustomerId).not.toBeNull();
    expect(row.matchScorePct).toBe(100);
    // The photo the model saw is kept with the reading (upright JPEG), the original stays as picked.
    const image = await photos.imageOf(staff, extractionId);
    expect([...image!.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    // One ai_calls row, priced from the env: 1,200 tokens in at $2.5/M + 300 out at $10/M = 6,000 micro-USD.
    const calls = await aiCalls.listAiCalls(staff, { purpose: 'read-bill' });
    const call = calls.find((c) => c.id === row.aiCallId)!;
    expect(call).toMatchObject({
      outcome: 'ok',
      model: 'fake-reader',
      promptVersion: 'read-bill/v1',
      costMicros: 6000,
    });
    expect(row.costMicros).toBe(6000);
  });

  it('says unreadable for a blurred photo and no-bill for a photo of something else', async () => {
    const owner = await scopeFor('sharma', 'owner');
    expect((await read(owner, 'blurred')).row).toMatchObject({ status: 'failed', error: 'unreadable' });
    expect((await read(owner, 'not-a-bill')).row).toMatchObject({ status: 'failed', error: 'no-bill' });
  });

  it('a malformed answer is a failed "invalid" reading with its error row, never a crash', async () => {
    const owner = await scopeFor('sharma', 'owner');
    setTransport(async () => ({ text: '{"legible": "maybe"}', tokensIn: 10, tokensOut: 2 }));
    try {
      const { row } = await read(owner, 'kaccha-05');
      expect(row).toMatchObject({ status: 'failed', error: 'invalid', result: null });
      const calls = await aiCalls.listAiCalls(owner, { purpose: 'read-bill' });
      expect(calls[0]).toMatchObject({ outcome: 'error', model: 'test-transport' });
    } finally {
      setTransport(null);
    }
  });

  it('without a model set up, the reading fails as "ai-unavailable" and no call is made', async () => {
    const owner = await scopeFor('sharma', 'owner');
    delete process.env.AI_TRANSPORT;
    const model = process.env.OPENAI_VISION_MODEL;
    delete process.env.OPENAI_VISION_MODEL;
    try {
      expect((await read(owner, 'kaccha-06')).row).toMatchObject({ status: 'failed', error: 'ai-unavailable' });
    } finally {
      process.env.AI_TRANSPORT = 'fake';
      if (model) process.env.OPENAI_VISION_MODEL = model;
    }
  });

  it('a file that is not a photo is refused at the door, or read as unreadable', async () => {
    const staff = await scopeFor('sharma', 'staff');
    await expect(
      photos.startRead(staff, { name: 'x.pdf', mime: 'application/pdf', bytes: new Uint8Array([1]) }),
    ).rejects.toMatchObject({ code: 'not-a-photo' });
    await expect(
      photos.startRead(staff, { name: 'x.jpg', mime: 'image/jpeg', bytes: new Uint8Array() }),
    ).rejects.toMatchObject({
      code: 'empty',
    });
    const { extractionId } = await photos.startRead(staff, {
      name: 'fake.jpg',
      mime: 'image/jpeg',
      bytes: new TextEncoder().encode('not really a jpeg'),
    });
    await runReadBill(
      { extractionId, businessId: staff.businessId, userId: staff.userId, role: 'staff', requestId: 'bad' },
      NOW,
    );
    expect(await photos.getExtraction(staff, extractionId)).toMatchObject({ status: 'failed', error: 'unreadable' });
  });

  it('the accountant reads but does not upload or review', async () => {
    const accountant = await scopeFor('sharma', 'accountant');
    await expect(
      photos.startRead(accountant, { name: 'a.jpg', mime: 'image/jpeg', bytes: photo('kaccha-01') }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('review and commit', () => {
  it('corrections are kept as rows; the commit needs an issued bill and is final', async () => {
    const staff = await scopeFor('sharma', 'staff');
    const { extractionId } = await read(staff, 'kaccha-07');
    const rows = await photos.recordCorrections(staff, extractionId, [
      { field: 'lines.0.rate', modelValue: '340', humanValue: '350' },
      { field: 'customer', modelValue: 'Joshi Builders', humanValue: 'Joshi Builders' }, // unchanged: no row
    ]);
    expect(rows.map((r) => [r.field, r.modelValue, r.humanValue])).toEqual([['lines.0.rate', '340', '350']]);
    expect((await photos.getExtraction(staff, extractionId)).status).toBe('reviewed');
    // A draft is not a bill: the trigger refuses the commit.
    const draft = await documents.createDraft(staff, {
      customer: { name: 'Photo Draft', stateCode: '27' },
      dateIso: '2026-10-15',
      lines: [{ description: 'x', quantityMilli: 1000, unitPricePaise: 100, gstBp: 1800, taxRateChosen: true }],
    });
    expect(await rootMessage(photos.commitReading(staff, extractionId, draft.id))).toMatch(/issued bill only/);
    const bill = await documents.probeIssuedBill(staff, 'Photo Customer');
    expect(await photos.commitReading(staff, extractionId, bill)).toMatchObject({
      status: 'committed',
      committedDocumentId: bill,
    });
    await expect(photos.discardReading(staff, extractionId)).rejects.toMatchObject({ code: 'final' });
    await expect(
      photos.recordCorrections(staff, extractionId, [{ field: 'date', modelValue: 'a', humanValue: 'b' }]),
    ).rejects.toMatchObject({ code: 'final' });
    // Corrections never change.
    await expect(
      withTenant(staff, ({ client }) =>
        client.query("update extraction_corrections set human_value = 'x' where id = $1", [rows[0]!.id]),
      ),
    ).rejects.toThrow(/append-only/);
  });
});

// Stage 11 review: two taps (or a reload and a second tap) on "Bill banao" made two issued bills from one photo.
describe('one photo, one bill', () => {
  it('only one claim wins; a refused bill lets go; after the commit a claim answers the bill already made', async () => {
    const staff = await scopeFor('sharma', 'staff');
    const { extractionId } = await read(staff, 'kaccha-07');
    const both = await Promise.allSettled([
      photos.claimReading(staff, extractionId),
      photos.claimReading(staff, extractionId),
    ]);
    expect(both.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((both.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'busy' });
    expect((await photos.getExtraction(staff, extractionId)).status).toBe('committing');
    // The bill was refused: the claim is let go and can be taken again.
    await photos.releaseReading(staff, extractionId);
    expect((await photos.getExtraction(staff, extractionId)).status).toBe('reviewed');
    expect(await photos.claimReading(staff, extractionId)).toEqual({ claimed: true, draftId: null });
    // Issued: corrections and the commit together.
    const bill = await documents.probeIssuedBill(staff, 'Photo Once');
    const done = await photos.finishReading(
      staff,
      extractionId,
      [{ field: 'lines.0.rate', modelValue: '340', humanValue: '350' }],
      bill,
    );
    expect(done).toMatchObject({ status: 'committed', committedDocumentId: bill });
    expect(await photos.claimReading(staff, extractionId)).toEqual({ claimed: false, documentId: bill });
  });
});

// Stage 7 review: a bill issued, then the commit failed (or the process died); five minutes on the claim counted as
// abandoned, was taken again, and a second bill was issued from the same photo.
describe('an abandoned claim whose bill was issued', () => {
  it('is finished with that bill, not taken again; one whose draft was never issued makes the bill from it', async () => {
    const staff = await scopeFor('sharma', 'staff');
    const { extractionId } = await read(staff, 'kaccha-08');
    expect(await photos.claimReading(staff, extractionId)).toEqual({ claimed: true, draftId: null });
    const draft = await documents.createDraft(staff, {
      customer: { name: 'Photo Twice', stateCode: null },
      placeOfSupplyStateCode: null,
      dateIso: '2026-10-15',
      gstOn: false,
      lines: [{ description: 'Repair', quantityMilli: 1000, unitPricePaise: 10000, gstBp: 0, taxRateChosen: true }],
    });
    await photos.markClaimDraft(staff, extractionId, draft.id);
    const age = () =>
      withTenant(staff, ({ client }) =>
        client.query("update extractions set updated_at = now() - interval '6 minutes' where id = $1", [extractionId]),
      );
    // Not issued yet, and the claim abandoned: taken again, with the same draft.
    await age();
    expect(await photos.claimReading(staff, extractionId)).toEqual({ claimed: true, draftId: draft.id });
    // Issued, and the commit never happened.
    const issued = await documents.issueDocument(staff, { id: draft.id, today: '2026-10-15' });
    await age();
    expect(await photos.claimReading(staff, extractionId)).toEqual({ claimed: false, documentId: issued.id });
    expect(await photos.getExtraction(staff, extractionId)).toMatchObject({
      status: 'committed',
      committedDocumentId: issued.id,
    });
  });
});

describe('I6 at the database: the model writes the reading and nothing else', () => {
  it('refuses a model actor on documents and customers, and on every step but its own', async () => {
    const owner = await scopeFor('sharma', 'owner');
    const model: TenantScope = { ...owner, actorKind: 'model' };
    // Not a bill, not a customer (refuse_model_actor on every authoritative table).
    expect(
      await rootMessage(
        documents.createDraft(model, {
          customer: { name: 'Model Made', stateCode: '27' },
          dateIso: '2026-10-15',
          lines: [{ description: 'x', quantityMilli: 1000, unitPricePaise: 100, gstBp: 0, taxRateChosen: true }],
        }),
      ),
    ).toMatch(/a model may not write documents/);
    await expect(
      withTenant(model, ({ client }) =>
        client.query("insert into customers (business_id, name) values ($1, 'Model Customer')", [owner.businessId]),
      ),
    ).rejects.toThrow(/a model may not write customers/);
    // Not the start of a reading.
    expect(
      await rootMessage(photos.startRead(model, { name: 'm.jpg', mime: 'image/jpeg', bytes: photo('kaccha-01') })),
    ).toMatch(/model may not/);
    // Its reading, once: a second write, a commit or a pointer at a bill are refused.
    const { extractionId } = await read(owner, 'kaccha-08');
    const raw = (sql: string, params: unknown[]) => withTenant(model, ({ client }) => client.query(sql, params));
    await expect(raw("update extractions set result = '{}'::jsonb where id = $1", [extractionId])).rejects.toThrow(
      /never changed/,
    );
    const bill = await documents.probeIssuedBill(owner, 'Model Commit');
    await expect(
      raw("update extractions set status = 'committed', committed_document_id = $2 where id = $1", [
        extractionId,
        bill,
      ]),
    ).rejects.toThrow(/model may only record its reading/);
    await expect(photos.recordReading(model, extractionId, { status: 'ready' })).rejects.toThrow(
      /pending extraction not found/,
    );
    // A person commits through the bill path, and the audit says who did what.
    await photos.commitReading(owner, extractionId, bill);
    const trail = await withTenant(
      owner,
      async ({ client }) =>
        (
          await client.query(
            "select actor_kind, after->>'status' as status, after ? 'image' as has_image from audit_events where table_name = 'extractions' and row_id = $1 order by id",
            [extractionId],
          )
        ).rows,
    );
    expect(trail.map((r: { actor_kind: string; status: string }) => `${r.actor_kind}:${r.status}`)).toEqual([
      'user:pending',
      'model:ready',
      'user:committed',
    ]);
    expect(trail.every((r: { has_image: boolean }) => !r.has_image)).toBe(true);
  });
});
