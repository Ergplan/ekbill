/** The model settings, from the environment (.env on the VM; never in the repository). */
export interface ModelConfig {
  apiKey: string | null;
  baseUrl: string;
  visionModel: string | null;
  textModel: string | null;
  realtimeModel: string | null;
}

export function modelConfig(env: NodeJS.ProcessEnv = process.env): ModelConfig {
  return {
    apiKey: env.OPENAI_API_KEY?.trim() || null,
    baseUrl: env.OPENAI_BASE_URL?.replace(/\/$/, '') || 'https://api.openai.com',
    visionModel: env.OPENAI_VISION_MODEL?.trim() || null,
    textModel: env.OPENAI_TEXT_MODEL?.trim() || null,
    realtimeModel: env.OPENAI_REALTIME_MODEL?.trim() || null,
  };
}
