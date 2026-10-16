/**
 * @ekbill/ai: every model call in EkBill goes through here (rule 9): a
 * versioned prompt (prompts/<name>/v<N>.md), a typed answer (zod), a
 * timeout, retries, and one ai_calls row per call. Stage 7 adds the first
 * real call: reading a photographed bill.
 */
export { modelConfig, type ModelConfig } from './config';
export { loadPrompt } from './prompts';
export {
  AiOutputError,
  AiUnavailableError,
  callVision,
  costMicros,
  fakeTransport,
  openAiTransport,
  setTransport,
  type AiCallRow,
  type Recorder,
  type Transport,
  type TransportAnswer,
  type VisionCall,
  type VisionRequest,
  type VisionResult,
} from './client';
export { readBillAnswer, type ReadBillAnswer } from './read-bill';
