import { createHash, randomUUID } from 'node:crypto';

import { AiUnavailableError, type Recorder } from './client';
import { modelConfig } from './config';
import { loadPrompt } from './prompts';

/**
 * The voice (Stage 9; salvaged from the MVP's src/lib/voice/session.ts and
 * app/api/voice/session): the server mints a short-lived client secret for
 * one OpenAI Realtime session, with the instructions (prompts/voice/v3.md)
 * and the tools baked in so the page cannot widen them. The browser talks to
 * OpenAI over WebRTC with that secret; the real key never leaves the server.
 * Each mint is one ai_calls row (purpose voice-session). The tools act through
 * the browser: open a screen, light up, fill, press the safe items; nothing
 * that commits (rule 17, I6).
 */
export const VOICE_PROMPT = { name: 'voice', version: 5 } as const;
export const TRANSCRIBE_PROMPT = { name: 'voice-transcribe', version: 2 } as const;
export const VOICE_LANGUAGE_PROMPT = { name: 'voice-language', version: 1 } as const;

/** The app's languages (the person's choice in Aap; @ekbill/copy's LOCALES). */
export type VoiceLocale = 'hi-Latn' | 'en' | 'hi' | 'mr' | 'ta';
export interface VoiceLanguage {
  name: string;
  note: string;
  script: string;
  words: string;
}

/** One language's section of prompts/voice-language: what the voice and the transcriber are told about it. */
export function voiceLanguage(locale: VoiceLocale = 'hi-Latn'): VoiceLanguage {
  const text = loadPrompt(VOICE_LANGUAGE_PROMPT.name, VOICE_LANGUAGE_PROMPT.version);
  const section = (code: string) => text.split(/^## /m).find((s) => s.split('\n', 1)[0]!.trim() === code);
  const body = section(locale) ?? section('hi-Latn')!;
  const field = (key: keyof VoiceLanguage) => new RegExp(`^${key}: (.+)$`, 'm').exec(body)?.[1]?.trim() ?? '';
  return { name: field('name'), note: field('note'), script: field('script'), words: field('words') };
}

/**
 * The transcriber's language hint (ISO 639-1). Hinglish has none: it is Hindi
 * and English in one sentence, and a "hi" hint writes it in Devanagari.
 */
const TRANSCRIBE_LANGUAGE: Record<VoiceLocale, string | null> = {
  'hi-Latn': null,
  en: 'en',
  hi: 'hi',
  mr: 'mr',
  ta: 'ta',
};
export const VOICE_SCREENS = [
  'home',
  'new_bill',
  'bills',
  'dues',
  'customers',
  'ask',
  'help',
  'you',
  'gst',
  'photo',
] as const;
export type VoiceScreen = (typeof VOICE_SCREENS)[number];

/** The business details the voice saves where the owner is (20 Oct), matching apps/web/actions/business.ts. */
export const BUSINESS_DETAIL_FIELDS = ['gstin', 'pan', 'upi', 'address', 'city', 'pincode', 'phone', 'email'] as const;

export const VOICE_TOOLS = [
  {
    type: 'function',
    name: 'start_bill',
    description:
      'Open the bill form for a customer with the lines filled in: a pakka bill, or a kaccha bill (an estimate) when the owner asks for one. The owner checks it and taps Bill banao; you do not make the bill. Use the customer name exactly as the owner said it; the app matches it to its list.',
    parameters: {
      type: 'object',
      properties: {
        customer_name: {
          type: 'string',
          description: 'Who the bill is for. Empty string for a new customer whose name the owner did not say.',
        },
        lines: {
          type: 'array',
          description: 'Each thing done: a short description, a quantity (default 1) and the rate in rupees.',
          items: {
            type: 'object',
            properties: {
              what: { type: 'string' },
              qty: { type: 'number' },
              rate: { type: 'number', description: 'Rupees per unit' },
            },
            required: ['what', 'rate'],
          },
        },
        kaccha: {
          type: 'boolean',
          description: 'True for a kaccha bill (an estimate, quotation); false or absent for a pakka bill.',
        },
      },
      required: ['customer_name', 'lines'],
    },
  },
  {
    type: 'function',
    name: 'who_owes',
    description:
      'The unpaid bills: who, how much, for how many days. Read it back briefly in Hinglish, biggest or oldest first.',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function',
    name: 'remind',
    description: 'Open the reminder for a customer who owes money. The owner sends it from there.',
    parameters: { type: 'object', properties: { customer_name: { type: 'string' } }, required: ['customer_name'] },
  },
  {
    type: 'function',
    name: 'ask_records',
    description:
      "Answer a question about the owner's own bills, customers, items or rates. Returns an answer written only from their records; read it back briefly. Not for who owes money now (use who_owes).",
    parameters: {
      type: 'object',
      properties: { question: { type: 'string', description: 'The question, in the words the owner used.' } },
      required: ['question'],
    },
  },
  {
    type: 'function',
    name: 'go_to',
    description:
      'Open a screen. new_bill asks whose bill; dues is who owes money; help is for a bill that is part of a bigger contract; photo is for making a bill from a photo. The app tells you what is on the new screen.',
    parameters: {
      type: 'object',
      properties: { screen: { type: 'string', enum: [...VOICE_SCREENS] } },
      required: ['screen'],
    },
  },
  {
    type: 'function',
    name: 'show',
    description:
      'Put the ring round one item on the screen (an item id from the [screen] list) while you talk about it, with the few words you are saying. Use it every time you ask for a field or mention a button.',
    parameters: {
      type: 'object',
      properties: {
        item_id: { type: 'string' },
        say: { type: 'string', description: 'Your words, short, shown under the ring.' },
      },
      required: ['item_id', 'say'],
    },
  },
  {
    type: 'function',
    name: 'fill',
    description:
      'Type what the owner said into a field on the screen (an item of kind field). Numbers as digits (3500, not teen hazaar). Then show the next field and ask for it.',
    parameters: {
      type: 'object',
      properties: { item_id: { type: 'string' }, value: { type: 'string' } },
      required: ['item_id', 'value'],
    },
  },
  {
    type: 'function',
    name: 'tap',
    description:
      'Press an item on the screen for the owner. Refused for OWNER-ONLY items (they make, save, send, pay or share): for those the ring goes round it and you ask the owner to tap it.',
    parameters: { type: 'object', properties: { item_id: { type: 'string' } }, required: ['item_id'] },
  },
  {
    type: 'function',
    name: 'update_business',
    description:
      "Save one detail of the owner's own business, right where you are, when the owner tells it to you: their GST number (they have GST after all), PAN, UPI ID, address, city, pincode, phone or email. Do not send them to another screen for it. The screen redraws with it (a bill form gets its GST choice at once). For a GST number, scheme is composition only if the owner said composition. Returns ok, or what is wrong to ask again.",
    parameters: {
      type: 'object',
      properties: {
        field: { type: 'string', enum: [...BUSINESS_DETAIL_FIELDS] },
        value: { type: 'string', description: 'As the owner said it; a GST number or PAN in capitals, no spaces.' },
        scheme: { type: 'string', enum: ['regular', 'composition'], description: 'Only for a GST number.' },
      },
      required: ['field', 'value'],
    },
  },
  {
    type: 'function',
    name: 'guide_steps',
    description:
      "The screen's tour: the things to point at, in order, with what to say. Use it when the owner asks what to do here or how this screen works.",
    parameters: { type: 'object', properties: {} },
  },
] as const;

const SETUP_NOTE =
  'RIGHT NOW the owner is setting up the app for the first time, one question per screen: the business name, whether they have GST (and the number), then what that needs. There are no bills or customers yet, so start_bill, who_owes, remind, ask_records and go_to do nothing; just help with the questions. Show each one, ask it, fill() the answer, tap() Aage. The last screen shows all the answers; the owner taps the button to start (OWNER-ONLY).';

/** The instructions for one session: the versioned prompt with the business, its customers and the setup note filled in. */
export function voiceInstructions(args: {
  businessName: string | null;
  customers: ReadonlyArray<{ name: string }>;
  /** The person's app language: the voice starts in it. */
  language?: VoiceLocale;
}): string {
  const lang = voiceLanguage(args.language);
  const names = args.customers
    .slice(0, 60)
    .map((c) =>
      c.name
        .replace(/[\r\n{}]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60),
    )
    .join(', ');
  return loadPrompt(VOICE_PROMPT.name, VOICE_PROMPT.version)
    .replace(
      '{{business}}',
      args.businessName
        ? `a small Indian business called "${args.businessName.replace(/["\r\n]+/g, ' ')}"`
        : 'small Indian businesses',
    )
    .replace('{{setup}}', args.businessName ? '' : `\n${SETUP_NOTE}\n`)
    .replaceAll('{{language}}', lang.name)
    .replace('{{languageNote}}', lang.note)
    .replace('{{customers}}', names || 'none yet');
}

/** What the transcriber is told: the language, its script and its common words. */
export function transcribePrompt(language?: VoiceLocale): string {
  const lang = voiceLanguage(language);
  return loadPrompt(TRANSCRIBE_PROMPT.name, TRANSCRIBE_PROMPT.version)
    .replace('{{language}}', lang.name)
    .replace('{{script}}', lang.script)
    .replace('{{words}}', lang.words)
    .trim();
}

/** The body sent to OpenAI to mint a client secret: ten minutes, one session, these instructions and tools. */
export function realtimeSessionBody(args: {
  businessName: string | null;
  customers: ReadonlyArray<{ name: string }>;
  language?: VoiceLocale;
  model: string;
  voice: string;
  /** A written copy of what the owner says; left out when no model is set (the realtime model hears the audio). */
  transcribeModel?: string | null;
}) {
  return {
    expires_after: { anchor: 'created_at', seconds: 600 },
    session: {
      type: 'realtime',
      model: args.model,
      instructions: voiceInstructions(args),
      audio: {
        input: {
          // Without a hint the transcriber guesses the language from a few syllables of Hinglish.
          ...(args.transcribeModel
            ? {
                transcription: {
                  model: args.transcribeModel,
                  prompt: transcribePrompt(args.language),
                  ...(TRANSCRIBE_LANGUAGE[args.language ?? 'hi-Latn']
                    ? { language: TRANSCRIBE_LANGUAGE[args.language ?? 'hi-Latn']! }
                    : {}),
                },
              }
            : {}),
          // A phone held close to the mouth, often in a shop with noise around.
          noise_reduction: { type: 'near_field' },
        },
        output: { voice: args.voice },
      },
      tools: VOICE_TOOLS,
      tool_choice: 'auto',
    },
  };
}

export interface RealtimeSecret {
  secret: string;
  expiresAt: number | null;
  model: string;
  baseUrl: string;
  /** The build's stand-in (AI_TRANSPORT=fake): the browser opens no connection and the tests drive the tools. */
  fake: boolean;
}

export type RealtimeTransport = (
  body: ReturnType<typeof realtimeSessionBody>,
  signal: AbortSignal,
) => Promise<{ value: string; expiresAt: number | null }>;

let override: RealtimeTransport | null = null;
/** Tests: mint with this transport (null restores the environment's). */
export function setRealtimeTransport(t: RealtimeTransport | null): void {
  override = t;
}

const openAiRealtimeTransport: RealtimeTransport = async (body, signal) => {
  const cfg = modelConfig();
  if (!cfg.apiKey) throw new AiUnavailableError('OPENAI_API_KEY is not set');
  const res = await fetch(`${cfg.baseUrl}/v1/realtime/client_secrets`, {
    method: 'POST',
    signal,
    headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`client_secrets ${res.status}`);
  const out = (await res.json()) as { value?: string; expires_at?: number };
  if (!out.value) throw new Error('client_secrets: no value');
  return { value: out.value, expiresAt: out.expires_at ?? null };
};

const fakeRealtimeTransport: RealtimeTransport = async () => ({
  value: `fake-${randomUUID()}`,
  expiresAt: Math.floor(Date.now() / 1000) + 600,
});

/** Whether a voice session can be minted here at all (a model and a key, or the stand-in). */
export function voiceAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  if (override || env.AI_TRANSPORT === 'fake') return true;
  const cfg = modelConfig(env);
  return Boolean(cfg.apiKey && cfg.realtimeModel);
}

export async function mintVoiceSession(args: {
  businessName: string | null;
  customers: ReadonlyArray<{ name: string }>;
  language?: VoiceLocale;
  record: Recorder;
}): Promise<RealtimeSecret> {
  const fake = !override && process.env.AI_TRANSPORT === 'fake';
  const cfg = modelConfig();
  const model = fake ? 'fake-realtime' : override ? 'test-realtime' : cfg.realtimeModel;
  if (!model) throw new AiUnavailableError('OPENAI_REALTIME_MODEL is not set');
  const body = realtimeSessionBody({ ...args, model, voice: cfg.realtimeVoice, transcribeModel: cfg.transcribeModel });
  const inputHash = createHash('sha256').update(body.session.instructions).digest('hex');
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  const row = (outcome: 'ok' | 'error' | 'timeout', error: string | null) =>
    args.record({
      purpose: 'voice-session',
      model,
      promptVersion: `${VOICE_PROMPT.name}/v${VOICE_PROMPT.version}`,
      inputHash,
      tokensIn: null,
      tokensOut: null,
      costMicros: null,
      latencyMs: Date.now() - started,
      outcome,
      error,
    });
  try {
    const t = override ?? (fake ? fakeRealtimeTransport : openAiRealtimeTransport);
    const out = await t(body, controller.signal);
    await row('ok', null);
    return { secret: out.value, expiresAt: out.expiresAt, model, baseUrl: cfg.baseUrl, fake };
  } catch (e) {
    if (e instanceof AiUnavailableError) throw e;
    await row(controller.signal.aborted ? 'timeout' : 'error', String((e as Error)?.message ?? e).slice(0, 300));
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
