/** The model settings, from the environment (.env on the VM; never in the repository). */
export interface ModelConfig {
  apiKey: string | null;
  baseUrl: string;
  visionModel: string | null;
  textModel: string | null;
  realtimeModel: string | null;
  embedModel: string | null;
  /** The Realtime voice's voice (OPENAI_REALTIME_VOICE). */
  realtimeVoice: string;
  /**
   * A transcript of what the owner says (OPENAI_TRANSCRIBE_MODEL). Optional: the realtime model hears the audio
   * itself; the transcript is only a written copy, and nothing in the app reads it yet.
   */
  transcribeModel: string | null;
}

export function modelConfig(env: NodeJS.ProcessEnv = process.env): ModelConfig {
  return {
    apiKey: env.OPENAI_API_KEY?.trim() || null,
    baseUrl: env.OPENAI_BASE_URL?.replace(/\/$/, '') || 'https://api.openai.com',
    visionModel: env.OPENAI_VISION_MODEL?.trim() || null,
    textModel: env.OPENAI_TEXT_MODEL?.trim() || null,
    realtimeModel: env.OPENAI_REALTIME_MODEL?.trim() || null,
    embedModel: env.OPENAI_EMBED_MODEL?.trim() || null,
    realtimeVoice: env.OPENAI_REALTIME_VOICE?.trim() || 'marin',
    transcribeModel: env.OPENAI_TRANSCRIBE_MODEL?.trim() || null,
  };
}
