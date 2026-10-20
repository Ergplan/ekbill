import { createHash } from 'node:crypto';

import type { Recorder } from './client';
import { modelConfig } from './config';

/**
 * The demo's recorded voice (20 Oct): one line of the demo script, spoken once by OpenAI's speech model and kept by
 * the caller (apps/web/app/api/demo/audio), so every person hears the same recording and no line is paid for
 * twice. Under AI_TRANSPORT=fake (the build) nothing is spoken: the demo shows its captions, and the browser's own
 * voice reads them where it has one. One ai_calls row per line spoken.
 */
export type SpeechLocale = 'hi-Latn' | 'en' | 'hi' | 'mr' | 'ta';

const STYLE: Record<SpeechLocale, string> = {
  'hi-Latn':
    'Speak in warm, friendly everyday Hindi as people in Indian towns talk, with English words like bill, GST and WhatsApp said the Indian way, in a natural Indian accent, at a relaxed, clear pace, like a helpful shopkeeper friend.',
  en: 'Speak in clear, warm Indian English at a relaxed pace, like a helpful shopkeeper friend.',
  hi: 'Speak in warm, simple everyday Hindi at a relaxed, clear pace, like a helpful shopkeeper friend.',
  mr: 'Speak in warm, simple everyday Marathi at a relaxed, clear pace, like a helpful shopkeeper friend.',
  ta: 'Speak in warm, simple everyday Tamil at a relaxed, clear pace, like a helpful shopkeeper friend.',
};

export interface SpeechConfig {
  model: string;
  voice: string;
}

/** The speech model and voice (OPENAI_TTS_MODEL, OPENAI_TTS_VOICE), or null where nothing may be spoken. */
export function speechConfig(env: NodeJS.ProcessEnv = process.env): SpeechConfig | null {
  if (env.AI_TRANSPORT === 'fake') return null;
  const cfg = modelConfig(env);
  if (!cfg.apiKey) return null;
  return {
    model: env.OPENAI_TTS_MODEL?.trim() || 'gpt-4o-mini-tts',
    voice: env.OPENAI_TTS_VOICE?.trim() || 'coral',
  };
}

export type SpeechTransport = (args: {
  text: string;
  locale: SpeechLocale;
  config: SpeechConfig;
  signal: AbortSignal;
}) => Promise<{ bytes: Buffer; mime: string }>;

let override: SpeechTransport | null = null;
/** Tests: speak with this transport (null restores the environment's). */
export function setSpeechTransport(t: SpeechTransport | null): void {
  override = t;
}

const openAiSpeech: SpeechTransport = async ({ text, locale, config, signal }) => {
  const cfg = modelConfig();
  const res = await fetch(`${cfg.baseUrl}/v1/audio/speech`, {
    method: 'POST',
    signal,
    headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      voice: config.voice,
      input: text,
      instructions: STYLE[locale],
      response_format: 'mp3',
    }),
  });
  if (!res.ok) {
    // OpenAI's own words (a wrong model, no access, the rate limit), so the log says why a line was not recorded.
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(`audio/speech ${res.status}: ${body?.error?.message ?? res.statusText}`.slice(0, 280));
  }
  return { bytes: Buffer.from(await res.arrayBuffer()), mime: 'audio/mpeg' };
};

/** The text's hash, the key a recording is kept under: a changed line is a new recording. */
export function speechHash(text: string, locale: SpeechLocale): string {
  return createHash('sha256').update(`${locale}\n${text}`).digest('hex');
}

/** Speaks one line; null when nothing may be spoken here (the build, no key). */
export async function speak(args: {
  text: string;
  locale: SpeechLocale;
  record: Recorder;
}): Promise<{ bytes: Buffer; mime: string } | null> {
  const config = override ? { model: 'test-tts', voice: 'test' } : speechConfig();
  if (!config) return null;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  const row = (outcome: 'ok' | 'error' | 'timeout', error: string | null) =>
    args.record({
      purpose: 'demo-speech',
      model: config.model,
      promptVersion: 'demo-speech/v1',
      inputHash: speechHash(args.text, args.locale),
      tokensIn: null,
      tokensOut: null,
      costMicros: null,
      latencyMs: Date.now() - started,
      outcome,
      error,
    });
  try {
    const out = await (override ?? openAiSpeech)({
      text: args.text,
      locale: args.locale,
      config,
      signal: controller.signal,
    });
    await row('ok', null);
    return out;
  } catch (e) {
    await row(controller.signal.aborted ? 'timeout' : 'error', String((e as Error)?.message ?? e).slice(0, 300));
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
