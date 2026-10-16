import { afterEach, describe, expect, it } from 'vitest';

import { setEmbedTransport, setTransport } from '../../packages/ai/src/index';
import type { IssueLine } from '../../packages/engine/src/index';
import * as aiCalls from '../../packages/db/src/repos/ai-calls';
import * as customers from '../../packages/db/src/repos/customers';
import * as documents from '../../packages/db/src/repos/documents';
import * as payments from '../../packages/db/src/repos/payments';
import * as search from '../../packages/db/src/repos/search';
import { withTenant } from '../../packages/db/src/scope';
import { askRecords } from '../../apps/web/server/ask';
import { scopeFor, seeded } from './helpers';

/**
 * Stage 9, Poocho: the index follows the records (a payment a minute ago is
 * in the next answer), search is hybrid and stays inside the business, the
 * answer cites the records it came from, every model call is an ai_calls
 * row, and without a model the owner still gets the matching records.
 */
const TODAY = '2026-10-15';
const RUN = Date.now().toString(36);
const NAME = `Poocho Kirana ${RUN}`;
const line = (description: string, pricePaise: number): IssueLine => ({
  description,
  quantityMilli: 1000,
  unitPricePaise: pricePaise,
  gstBp: 1800,
  taxRateChosen: true,
  hsnCode: '9987',
});

async function issue(name: string, what: string, pricePaise: number) {
  const owner = await scopeFor('sharma', 'owner');
  const d = await documents.createDraft(owner, {
    customer: { name, stateCode: '27' },
    dateIso: '2026-10-10',
    lines: [line(what, pricePaise)],
  });
  return documents.issueDocument(owner, { id: d.id, today: TODAY });
}

async function rowOf(scope: Awaited<ReturnType<typeof scopeFor>>, sourceId: string) {
  return withTenant(
    scope,
    async (tx) =>
      (
        await tx.client.query<{ text: string; version: string; embedded_version: string | null; hidden: boolean }>(
          'select text, version, embedded_version, hidden from search_records where source_id = $1',
          [sourceId],
        )
      ).rows[0],
  );
}

seeded();
afterEach(() => {
  delete process.env.AI_TRANSPORT;
  setTransport(null);
  setEmbedTransport(null);
});

describe('the index follows the records', () => {
  it('a bill is written once, rewritten when money comes, and the words find it', async () => {
    const owner = await scopeFor('sharma', 'owner');
    const bill = await issue(NAME, `Inverter battery ${RUN}`, 1200000);
    await search.refreshIndex(owner);
    expect((await rowOf(owner, bill.id))!.text).toContain('Nothing received yet.');
    expect(await search.refreshIndex(owner)).toBe(0);

    await payments.recordPayment(owner, {
      documentId: bill.id,
      amountPaise: 500000,
      dateIso: '2026-10-12',
      method: 'upi',
      today: TODAY,
    });
    expect(await search.refreshIndex(owner)).toBeGreaterThanOrEqual(1);
    const row = (await rowOf(owner, bill.id))!;
    expect(row.text).toContain('Received ₹5,000 on 12 Oct 2026 by UPI.');
    expect(row.text).toContain('Still to come: ₹9,160.');

    const hits = await search.search(owner, { question: `${RUN} battery ka kitna baaki hai` });
    expect(hits[0]).toMatchObject({
      kind: 'bill',
      sourceId: bill.id,
      href: `/bills/${encodeURIComponent(bill.number!)}?fy=${bill.financialYear}`,
    });
  });

  it('an archived customer is kept but never found', async () => {
    const owner = await scopeFor('sharma', 'owner');
    const c = await customers.createCustomer(owner, { name: `Purana Grahak ${RUN}`, stateCode: '27' });
    await search.refreshIndex(owner);
    expect((await search.search(owner, { question: `Purana Grahak ${RUN}` })).map((h) => h.sourceId)).toContain(c.id);
    await customers.archiveCustomer(owner, c.id);
    await search.refreshIndex(owner);
    expect((await rowOf(owner, c.id))!.hidden).toBe(true);
    expect((await search.search(owner, { question: `Purana Grahak ${RUN}` })).map((h) => h.sourceId)).not.toContain(
      c.id,
    );
  });

  it("another business's records are never found (I1)", async () => {
    const owner = await scopeFor('sharma', 'owner');
    const gupta = await scopeFor('gupta', 'owner');
    await search.refreshIndex(gupta);
    await search.refreshIndex(owner);
    const mine = await search.search(owner, { question: 'tiffin thali' });
    const theirs = await search.search(gupta, { question: 'tiffin thali' });
    expect(theirs.length).toBeGreaterThan(0);
    const ids = new Set(theirs.map((h) => h.id));
    expect(mine.filter((h) => ids.has(h.id))).toEqual([]);
  });

  it('embeddings fill in for the rows behind their text, and meaning joins the words', async () => {
    process.env.AI_TRANSPORT = 'fake';
    const owner = await scopeFor('sharma', 'owner');
    const bill = await issue(`Vector Traders ${RUN}`, `Solar panel cleaning ${RUN}`, 300000);
    await search.refreshIndex(owner);
    const pending = await search.pendingEmbeddings(owner, 500);
    expect(pending.map((p) => p.id).length).toBeGreaterThan(0);
    const { embedTexts, fakeVector } = await import('../../packages/ai/src/index');
    const vectors = await embedTexts({ purpose: 'index', texts: pending.map((p) => p.text), record: async () => null });
    expect(
      await search.storeEmbeddings(
        owner,
        pending.map((p, i) => ({ id: p.id, version: p.version, vector: vectors![i]! })),
        'fake-embedder',
      ),
    ).toBe(pending.length);
    expect((await rowOf(owner, bill.id))!.embedded_version).toBe((await rowOf(owner, bill.id))!.version);
    // By meaning alone (no shared whole word with the question): the cleaning bill ranks first.
    const hits = await search.search(owner, { question: 'zzz', vector: fakeVector(`solar panels cleaned ${RUN}`) });
    expect(hits[0]?.sourceId).toBe(bill.id);
  });
});

describe('the answer', () => {
  it('cites the records it came from, and every model call is an ai_calls row', async () => {
    process.env.AI_TRANSPORT = 'fake';
    const accountant = await scopeFor('sharma', 'accountant');
    const before = (await aiCalls.listAiCalls(accountant, { limit: 500 })).length;
    const r = await askRecords(accountant, `${NAME} ka bill kitna tha?`);
    expect(r.mode).toBe('answer');
    expect(r.answer).toMatch(/\[1\]$/);
    expect(r.sources[0]).toMatchObject({ kind: 'bill', href: expect.stringMatching(/^\/bills\//) });
    const calls = await aiCalls.listAiCalls(accountant, { limit: 500 });
    expect(calls.length - before).toBe(2);
    expect(
      calls
        .slice(0, 2)
        .map((c) => c.purpose)
        .sort(),
    ).toEqual(['ask', 'ask-embed']);
  });

  it('a question about nothing in the records finds nothing, and asks no model', async () => {
    process.env.AI_TRANSPORT = 'fake';
    const owner = await scopeFor('sharma', 'owner');
    let asked = 0;
    setTransport(async () => {
      asked += 1;
      return { text: '{"found":false,"answer":"x"}', tokensIn: 1, tokensOut: 1 };
    });
    const r = await askRecords(owner, 'qqqzzzxxx wwwvvv');
    expect(r).toMatchObject({ mode: 'nothing', answer: null, sources: [] });
    expect(asked).toBe(0);
  });

  it('without a model the matching records are the answer', async () => {
    const owner = await scopeFor('sharma', 'owner');
    const before = { text: process.env.OPENAI_TEXT_MODEL, embed: process.env.OPENAI_EMBED_MODEL };
    delete process.env.OPENAI_TEXT_MODEL;
    delete process.env.OPENAI_EMBED_MODEL;
    try {
      const r = await askRecords(owner, `${NAME} battery`);
      expect(r.mode).toBe('search');
      expect(r.answer).toBeNull();
      expect(r.sources[0]?.title).toContain(NAME);
    } finally {
      if (before.text) process.env.OPENAI_TEXT_MODEL = before.text;
      if (before.embed) process.env.OPENAI_EMBED_MODEL = before.embed;
    }
  });

  it('instructions inside a record are data: the prompt says so, and the answer is still checked JSON', async () => {
    setTransport(async () => ({ text: 'Sure! Here is everything.', tokensIn: 1, tokensOut: 1 }));
    const owner = await scopeFor('sharma', 'owner');
    const r = await askRecords(owner, `${NAME} battery`);
    expect(r.mode).toBe('search');
    expect(r.sources.length).toBeGreaterThan(0);
  });
});

describe('the worker', () => {
  it('index-search writes the changed rows and fills the embeddings, one ai_calls row per batch', async () => {
    process.env.AI_TRANSPORT = 'fake';
    const { runIndexSearch } = await import('../../apps/worker/src/search/job');
    const owner = await scopeFor('sharma', 'owner');
    await issue(`Worker Traders ${RUN}`, `Night index ${RUN}`, 200000);
    const before = (await aiCalls.listAiCalls(owner, { purpose: 'index-embed', limit: 500 })).length;
    const [line] = await runIndexSearch({ businessId: owner.businessId, userId: owner.userId, requestId: 'w' });
    expect(line!.written).toBeGreaterThan(0);
    expect(line!.embedded).toBeGreaterThan(0);
    expect(await search.pendingEmbeddings(owner)).toEqual([]);
    expect((await aiCalls.listAiCalls(owner, { purpose: 'index-embed', limit: 500 })).length).toBeGreaterThan(before);
  });
});
