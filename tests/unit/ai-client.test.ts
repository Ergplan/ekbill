import { afterEach, describe, expect, it } from 'vitest';

import {
  AiOutputError,
  AiUnavailableError,
  callVision,
  costMicros,
  loadPrompt,
  readBillAnswer,
  setTransport,
  type AiCallRow,
} from '../../packages/ai/src/index';

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
