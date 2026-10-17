import { z } from 'zod';

/** Poocho's answer (prompts/ask/v2.md): found or not, and the words with their citations. */
export const askAnswer = z.object({
  found: z.boolean(),
  answer: z.string().min(1).max(1200),
});
export type AskAnswer = z.infer<typeof askAnswer>;
