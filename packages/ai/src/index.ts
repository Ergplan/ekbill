/**
 * @ekbill/ai: every model call in EkBill goes through here (rule 9).
 *
 * Stage 0 ships the shape only: the prompt loader and the client config. The
 * first real call (reading a photographed bill) arrives in Stage 7, with the
 * ai_calls row, retries and timeouts around it.
 */
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
