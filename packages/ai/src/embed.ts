import { createHash } from 'node:crypto';

import { AiUnavailableError, costMicros, type Recorder } from './client';
import { modelConfig } from './config';

/**
 * Embeddings for Poocho's search by meaning (Stage 9). One call embeds a
 * batch; it writes one ai_calls row like every other call (rule 9). Null
 * when no embedding model is set up or the call fails: search then runs on
 * words alone, which it always does underneath anyway. The fake (the build's
 * AI_TRANSPORT=fake) hashes words and their three-letter pieces into the same
 * number of dimensions, so the tests exercise the hybrid ranking for real.
 */
export const EMBED_DIMENSIONS = 256;

export type EmbedTransport = (
  req: { model: string; input: string[]; dimensions: number },
  signal: AbortSignal,
) => Promise<{ vectors: number[][]; tokensIn: number | null }>;

let override: EmbedTransport | null = null;
/** Tests: answer every embedding with this transport (null restores the environment's). */
export function setEmbedTransport(t: EmbedTransport | null): void {
  override = t;
}

export const openAiEmbedTransport: EmbedTransport = async (req, signal) => {
  const cfg = modelConfig();
  if (!cfg.apiKey) throw new AiUnavailableError('OPENAI_API_KEY is not set');
  const res = await fetch(`${cfg.baseUrl}/v1/embeddings`, {
    method: 'POST',
    signal,
    headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: req.model, input: req.input, dimensions: req.dimensions }),
  });
  if (!res.ok) throw new Error(`embeddings ${res.status}`);
  const body = (await res.json()) as {
    data?: Array<{ index: number; embedding: number[] }>;
    usage?: { prompt_tokens?: number };
  };
  const vectors: number[][] = new Array(req.input.length);
  for (const d of body.data ?? []) vectors[d.index] = d.embedding;
  return { vectors, tokensIn: body.usage?.prompt_tokens ?? null };
};

/** Words and their three-letter pieces, hashed into the dimensions and normalised: similar words land close. */
export function fakeVector(text: string, dimensions = EMBED_DIMENSIONS): number[] {
  const v = new Array<number>(dimensions).fill(0);
  const words = text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  const bump = (piece: string, weight: number) => {
    const h = createHash('md5').update(piece).digest();
    v[h.readUInt16BE(0) % dimensions]! += h[2]! & 1 ? weight : -weight;
  };
  for (const w of words) {
    bump(`w:${w}`, 1);
    for (let i = 0; i + 3 <= w.length; i += 1) bump(`t:${w.slice(i, i + 3)}`, 0.5);
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export const fakeEmbedTransport: EmbedTransport = async (req) => ({
  vectors: req.input.map((t) => fakeVector(t, req.dimensions)),
  tokensIn: req.input.reduce((s, t) => s + Math.ceil(t.length / 4), 0),
});

/** The model the vectors come from now (the stand-in's name under AI_TRANSPORT=fake), or null: words only. */
export function embedModelName(): string | null {
  if (override) return 'test-embedder';
  if (process.env.AI_TRANSPORT === 'fake') return 'fake-embedder';
  return modelConfig().embedModel;
}

export async function embedTexts(args: {
  purpose: string;
  texts: string[];
  record: Recorder;
  timeoutMs?: number;
}): Promise<number[][] | null> {
  if (!args.texts.length) return [];
  const model = embedModelName();
  if (!model) return null;
  const t = override ?? (process.env.AI_TRANSPORT === 'fake' ? fakeEmbedTransport : openAiEmbedTransport);
  const input = args.texts.map((x) => x.slice(0, 8000));
  const inputHash = createHash('sha256').update(input.join('\u0000')).digest('hex');
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 20_000);
  try {
    const { vectors, tokensIn } = await t({ model, input, dimensions: EMBED_DIMENSIONS }, controller.signal);
    const ok = vectors.length === input.length && vectors.every((e) => e?.length === EMBED_DIMENSIONS);
    await args.record({
      purpose: args.purpose,
      model,
      promptVersion: 'embed/none',
      inputHash,
      tokensIn,
      tokensOut: null,
      costMicros: costMicros(tokensIn, 0, process.env, 'OPENAI_EMBED'),
      latencyMs: Date.now() - started,
      outcome: ok ? 'ok' : 'error',
      error: ok ? null : 'wrong dimensions',
    });
    return ok ? vectors : null;
  } catch (e) {
    await args.record({
      purpose: args.purpose,
      model,
      promptVersion: 'embed/none',
      inputHash,
      tokensIn: null,
      tokensOut: null,
      costMicros: null,
      latencyMs: Date.now() - started,
      outcome: controller.signal.aborted ? 'timeout' : 'error',
      error: String((e as Error)?.message ?? e).slice(0, 300),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
