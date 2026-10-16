import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { z } from 'zod';

import { modelConfig } from './config';
import { loadPrompt } from './prompts';

/**
 * The one model client (rule 9). A call: the versioned prompt, a typed
 * answer checked by zod, a timeout, a retry on a busy or failing endpoint,
 * and one ai_calls row whatever happened (the caller's recorder writes it,
 * so this package needs no database). The transport is OpenAI's chat
 * completions endpoint; tests and the build's journeys use the fake one
 * (AI_TRANSPORT=fake), which answers from files and never leaves the box.
 */
export interface VisionRequest {
  model: string;
  system: string;
  text: string;
  imageJpeg: Buffer;
  /** What the fake transport answers by (the upload's sha256); never sent to a model. */
  key: string;
}
export interface TransportAnswer {
  text: string;
  tokensIn: number | null;
  tokensOut: number | null;
}
export type Transport = (req: VisionRequest, signal: AbortSignal) => Promise<TransportAnswer>;

/** No model is set up here (no key or no model ID): the caller says so to the person. */
export class AiUnavailableError extends Error {
  constructor(reason: string) {
    super(`ai unavailable: ${reason}`);
    this.name = 'AiUnavailableError';
  }
}
/** The model answered, but not in the shape asked for. */
export class AiOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiOutputError';
  }
}
/** A busy or failing endpoint (429, 5xx): worth one more try. A transport marks its own with `retryable`. */
class TransientError extends Error {
  readonly retryable = true;
}

export interface AiCallRow {
  purpose: string;
  model: string;
  promptVersion: string;
  inputHash: string;
  tokensIn: number | null;
  tokensOut: number | null;
  costMicros: number | null;
  latencyMs: number;
  outcome: 'ok' | 'error' | 'timeout' | 'refused';
  error: string | null;
}
/** Writes the ai_calls row; answers its id. */
export type Recorder = (row: AiCallRow) => Promise<string | null>;

let override: Transport | null = null;
/** Tests: answer every call with this transport (null restores the environment's). */
export function setTransport(t: Transport | null): void {
  override = t;
}

export const openAiTransport: Transport = async (req, signal) => {
  const cfg = modelConfig();
  if (!cfg.apiKey) throw new AiUnavailableError('OPENAI_API_KEY is not set');
  const res = await fetch(`${cfg.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    signal,
    headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: req.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: req.system },
        {
          role: 'user',
          content: [
            { type: 'text', text: req.text },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${req.imageJpeg.toString('base64')}`, detail: 'high' },
            },
          ],
        },
      ],
    }),
  });
  if (res.status === 429 || res.status >= 500) throw new TransientError(`status ${res.status}`);
  if (!res.ok) throw new Error(`status ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null; refusal?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const message = body.choices?.[0]?.message;
  if (message?.refusal) throw new AiOutputError(`refused: ${message.refusal.slice(0, 200)}`);
  return {
    text: message?.content ?? '',
    tokensIn: body.usage?.prompt_tokens ?? null,
    tokensOut: body.usage?.completion_tokens ?? null,
  };
};

/**
 * The build's stand-in model: answers from `<AI_FAKE_DIR>/<key>.json` (the
 * photo's sha256), else "no bill here". Used by the tests and the journeys,
 * and by `eval:read-bill --fake` to check the harness; never in production.
 */
export const fakeTransport: Transport = async (req) => {
  const dir = process.env.AI_FAKE_DIR ?? join(process.cwd(), 'tests', 'fixtures', 'bills', 'fake');
  const file = join(dir, `${req.key}.json`);
  const text = existsSync(file)
    ? readFileSync(file, 'utf8')
    : JSON.stringify({
        legible: true,
        found: false,
        customer: { value: null, confidence: 0, unreadable: true },
        date: { value: null, confidence: 0, unreadable: true },
        lines: [],
        total: { value: null, confidence: 0, unreadable: true },
        notes: null,
      });
  return { text, tokensIn: 1200, tokensOut: 300 };
};

function transport(): Transport {
  if (override) return override;
  return process.env.AI_TRANSPORT === 'fake' ? fakeTransport : openAiTransport;
}

/** USD per million tokens is micro-USD per token: the env's prices (OPENAI_VISION_PRICE_IN/OUT) give cost_micros. */
export function costMicros(
  tokensIn: number | null,
  tokensOut: number | null,
  env: Record<string, string | undefined> = process.env,
): number | null {
  const pin = Number(env.OPENAI_VISION_PRICE_IN);
  const pout = Number(env.OPENAI_VISION_PRICE_OUT);
  if (!Number.isFinite(pin) || !Number.isFinite(pout) || !env.OPENAI_VISION_PRICE_IN || tokensIn === null) return null;
  return Math.round(tokensIn * pin + (tokensOut ?? 0) * pout);
}

export interface VisionCall<T> {
  purpose: string;
  prompt: { name: string; version: number };
  text: string;
  imageJpeg: Buffer;
  key: string;
  output: z.ZodType<T>;
  record: Recorder;
  timeoutMs?: number;
  retries?: number;
}
export interface VisionResult<T> {
  value: T;
  callId: string | null;
  model: string;
  promptVersion: string;
  costMicros: number | null;
  latencyMs: number;
}

export async function callVision<T>(call: VisionCall<T>): Promise<VisionResult<T>> {
  const fake = !override && process.env.AI_TRANSPORT === 'fake';
  const model = fake ? 'fake-reader' : override ? 'test-transport' : modelConfig().visionModel;
  if (!model) throw new AiUnavailableError('OPENAI_VISION_MODEL is not set');
  const system = loadPrompt(call.prompt.name, call.prompt.version);
  const promptVersion = `${call.prompt.name}/v${call.prompt.version}`;
  const inputHash = createHash('sha256').update(system).update(call.text).update(call.imageJpeg).digest('hex');
  const retries = call.retries ?? 2;
  const started = Date.now();
  let lastError: unknown = null;
  let outcome: AiCallRow['outcome'] = 'error';
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), call.timeoutMs ?? 60_000);
    try {
      const answer = await transport()(
        { model, system, text: call.text, imageJpeg: call.imageJpeg, key: call.key },
        controller.signal,
      );
      const latencyMs = Date.now() - started;
      const cost = costMicros(answer.tokensIn, answer.tokensOut);
      let parsed: T;
      try {
        const json: unknown = JSON.parse(answer.text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
        const checked = call.output.safeParse(json);
        if (!checked.success) throw new AiOutputError(`schema: ${checked.error.issues[0]?.message ?? 'invalid'}`);
        parsed = checked.data;
      } catch (e) {
        const message = e instanceof AiOutputError ? e.message : 'not JSON';
        await call.record({
          purpose: call.purpose,
          model,
          promptVersion,
          inputHash,
          tokensIn: answer.tokensIn,
          tokensOut: answer.tokensOut,
          costMicros: cost,
          latencyMs,
          outcome: 'error',
          error: message,
        });
        throw new AiOutputError(message);
      }
      const callId = await call.record({
        purpose: call.purpose,
        model,
        promptVersion,
        inputHash,
        tokensIn: answer.tokensIn,
        tokensOut: answer.tokensOut,
        costMicros: cost,
        latencyMs,
        outcome: 'ok',
        error: null,
      });
      return { value: parsed, callId, model, promptVersion, costMicros: cost, latencyMs };
    } catch (e) {
      if (e instanceof AiOutputError || e instanceof AiUnavailableError) {
        if (e instanceof AiOutputError && e.message.startsWith('refused'))
          await call.record({
            purpose: call.purpose,
            model,
            promptVersion,
            inputHash,
            tokensIn: null,
            tokensOut: null,
            costMicros: null,
            latencyMs: Date.now() - started,
            outcome: 'refused',
            error: e.message,
          });
        throw e;
      }
      lastError = e;
      outcome = controller.signal.aborted ? 'timeout' : 'error';
      const transient =
        e instanceof TransientError || (e as { retryable?: boolean }).retryable === true || controller.signal.aborted;
      if (!transient || attempt === retries) break;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  await call.record({
    purpose: call.purpose,
    model,
    promptVersion,
    inputHash,
    tokensIn: null,
    tokensOut: null,
    costMicros: null,
    latencyMs: Date.now() - started,
    outcome,
    error: String((lastError as Error)?.message ?? lastError).slice(0, 300),
  });
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
