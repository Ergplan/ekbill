import { afterEach, describe, expect, it } from 'vitest';

import {
  AiOutputError,
  AiUnavailableError,
  EMBED_DIMENSIONS,
  askAnswer,
  callText,
  callVision,
  costMicros,
  embedTexts,
  loadPrompt,
  readBillAnswer,
  setEmbedTransport,
  setTransport,
  type AiCallRow,
} from '../../packages/ai/src/index';
import { recordsMessage } from '../../packages/engine/src/index';

/** Rule 9: one client, a versioned prompt, a typed answer, retries, a timeout, one ai_calls row per call. */
const GOOD = JSON.stringify({
  legible: true,
  found: true,
  customer: { value: 'Mehta', confidence: 0.9 },
  date: { value: '12/10/26', confidence: 0.8 },
  lines: [
    {
      what: { value: 'Fan', confidence: 0.9 },
      qty: { value: 1, confidence: 0.9 },
      rate: { value: '350', confidence: 0.9 },
      amount: { value: '350', confidence: 0.9 },
    },
  ],
  total: { value: '350', confidence: 0.9 },
  notes: null,
});
function run(rows: AiCallRow[], extra: { timeoutMs?: number; retries?: number } = {}) {
  return callVision({
    purpose: 'read-bill',
    prompt: { name: 'read-bill', version: 1 },
    text: 'hints',
    imageJpeg: Buffer.from([0xff, 0xd8]),
    key: 'k',
    output: readBillAnswer,
    record: async (row) => {
      rows.push(row);
      return `call-${rows.length}`;
    },
    ...extra,
  });
}
afterEach(() => setTransport(null));

describe('callVision', () => {
  it('loads the versioned prompt and checks the answer; one ok row', async () => {
    const rows: AiCallRow[] = [];
    let seen = '';
    setTransport(async (req) => {
      seen = req.system;
      return { text: GOOD, tokensIn: 1000, tokensOut: 200 };
    });
    const r = await run(rows);
    expect(seen).toBe(loadPrompt('read-bill', 1));
    expect(r.promptVersion).toBe('read-bill/v1');
    expect(r.value.lines[0]!.qty.value).toBe('1'); // numbers come back as the strings the engine parses
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ purpose: 'read-bill', outcome: 'ok', tokensIn: 1000, tokensOut: 200 });
    expect(rows[0]!.inputHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a malformed answer is an error row and an AiOutputError, never a crash or a guess', async () => {
    for (const text of ['not json', JSON.stringify({ legible: true }), '{"legible":"yes"}']) {
      const rows: AiCallRow[] = [];
      setTransport(async () => ({ text, tokensIn: 10, tokensOut: 1 }));
      await expect(run(rows)).rejects.toBeInstanceOf(AiOutputError);
      expect(rows).toEqual([expect.objectContaining({ outcome: 'error' })]);
    }
  });

  it('retries a busy endpoint, then records the one call that answered', async () => {
    const rows: AiCallRow[] = [];
    let n = 0;
    setTransport(async () => {
      n += 1;
      if (n === 1) throw Object.assign(new Error('status 503'), { retryable: true });
      return { text: GOOD, tokensIn: 5, tokensOut: 5 };
    });
    const r = await run(rows, { retries: 2 });
    expect(n).toBe(2);
    expect(r.callId).toBe('call-1');
    expect(rows).toEqual([expect.objectContaining({ outcome: 'ok' })]);
  });

  it('does not retry a plain failure: one error row', async () => {
    const rows: AiCallRow[] = [];
    let n = 0;
    setTransport(async () => {
      n += 1;
      throw new Error('status 400: bad request');
    });
    await expect(run(rows, { retries: 2 })).rejects.toThrow('status 400');
    expect(n).toBe(1);
    expect(rows).toEqual([expect.objectContaining({ outcome: 'error', error: 'status 400: bad request' })]);
  });

  it('gives up after the timeout with a timeout row', async () => {
    const rows: AiCallRow[] = [];
    setTransport(
      (_req, signal) =>
        new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
    );
    await expect(run(rows, { timeoutMs: 20, retries: 0 })).rejects.toThrow('aborted');
    expect(rows).toEqual([expect.objectContaining({ outcome: 'timeout' })]);
  });

  it('is unavailable without a model ID, and makes no row', async () => {
    const before = process.env.OPENAI_VISION_MODEL;
    delete process.env.OPENAI_VISION_MODEL;
    delete process.env.AI_TRANSPORT;
    const rows: AiCallRow[] = [];
    await expect(run(rows)).rejects.toBeInstanceOf(AiUnavailableError);
    expect(rows).toEqual([]);
    if (before) process.env.OPENAI_VISION_MODEL = before;
  });

  it('prices a call from the env (USD per million tokens = micro-USD per token)', () => {
    expect(costMicros(1000, 200, { OPENAI_VISION_PRICE_IN: '2.5', OPENAI_VISION_PRICE_OUT: '10' })).toBe(4500);
    expect(costMicros(1000, 200, {})).toBeNull();
  });
});

describe('callText and embedTexts (Poocho, Stage 9)', () => {
  it('a text call uses the versioned ask prompt, sends no image, and records one ok row', async () => {
    const rows: AiCallRow[] = [];
    const seen: Array<{ image: boolean; system: string }> = [];
    setTransport(async (req) => {
      seen.push({ image: Boolean(req.imageJpeg), system: req.system });
      return { text: '{"found":true,"answer":"₹3,500 [1]"}', tokensIn: 300, tokensOut: 20 };
    });
    const r = await callText({
      purpose: 'ask',
      prompt: { name: 'ask', version: 1 },
      text: recordsMessage('rate?', [{ title: 'Item · AMC', text: 'Usual rate ₹3,500.' }]),
      key: 'ask',
      output: askAnswer,
      record: async (row) => {
        rows.push(row);
        return 'call-1';
      },
    });
    expect(r.value).toEqual({ found: true, answer: '₹3,500 [1]' });
    expect(seen).toEqual([{ image: false, system: loadPrompt('ask', 1) }]);
    expect(rows).toMatchObject([{ purpose: 'ask', promptVersion: 'ask/v1', outcome: 'ok' }]);
  });

  it('the stand-in answers from the record that shares the question’s words, cited, or says not found', async () => {
    process.env.AI_TRANSPORT = 'fake';
    try {
      const call = (q: string) =>
        callText({
          purpose: 'ask',
          prompt: { name: 'ask', version: 1 },
          text: recordsMessage(q, [
            { title: 'Customer · Gupta', text: 'Customer Gupta Stores, Nagpur. Last billed on 01 Oct 2026.' },
            { title: 'Item · AMC visit', text: 'Item AMC visit. Usual rate ₹3,500 per visit.' },
          ]),
          key: 'ask',
          output: askAnswer,
          record: async () => null,
        });
      expect((await call('AMC visit ka rate')).value).toEqual({ found: true, answer: 'Item AMC visit. [2]' });
      expect((await call('xyz')).value.found).toBe(false);
    } finally {
      delete process.env.AI_TRANSPORT;
    }
  });

  it('embeddings: one row per batch; null without a model; the stand-in puts similar words close', async () => {
    const rows: AiCallRow[] = [];
    const record = async (row: AiCallRow) => {
      rows.push(row);
      return null;
    };
    delete process.env.OPENAI_EMBED_MODEL;
    expect(await embedTexts({ purpose: 'ask-embed', texts: ['x'], record })).toBeNull();
    expect(rows).toEqual([]);
    process.env.AI_TRANSPORT = 'fake';
    try {
      const v = await embedTexts({ purpose: 'index', texts: ['Mehta Traders AMC', 'mehta', 'cement bags'], record });
      expect(v).toHaveLength(3);
      expect(v![0]).toHaveLength(EMBED_DIMENSIONS);
      const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0);
      expect(dot(v![0]!, v![1]!)).toBeGreaterThan(dot(v![2]!, v![1]!));
      expect(rows).toMatchObject([
        { purpose: 'index', model: 'fake-embedder', outcome: 'ok', promptVersion: 'embed/none' },
      ]);
    } finally {
      delete process.env.AI_TRANSPORT;
    }
  });

  it('a failing embedding endpoint is an error row and words-only search, never a throw', async () => {
    const rows: AiCallRow[] = [];
    setEmbedTransport(async () => {
      throw new Error('embeddings 500');
    });
    try {
      expect(
        await embedTexts({ purpose: 'ask-embed', texts: ['x'], record: async (r) => (rows.push(r), null) }),
      ).toBeNull();
      expect(rows).toMatchObject([{ outcome: 'error', error: 'embeddings 500' }]);
    } finally {
      setEmbedTransport(null);
    }
  });

  it('prices by the call kind', () => {
    expect(costMicros(1000, 0, { OPENAI_EMBED_PRICE_IN: '0.02' }, 'OPENAI_EMBED')).toBe(20);
    expect(costMicros(1000, 100, { OPENAI_TEXT_PRICE_IN: '1', OPENAI_TEXT_PRICE_OUT: '4' }, 'OPENAI_TEXT')).toBe(1400);
  });
});
