// Types for the review script, so the unit test is checked against its surface.
export const ROOT: string;
export const CHECKLIST: string;
export function loadEnv(root?: string): Record<string, string | undefined>;
export function stagePrompt(markdown: string, stage: number): string;
export function stageDiff(stage: number, options?: { root?: string; base?: string }): string;
export function buildReviewPrompt(inputs: {
  stage: number;
  diff: string;
  claudeMd: string;
  prompt: string;
  report: string;
}): { system: string; user: string };
export function parseVerdict(text: string): 'clean' | 'defects' | 'unclear';
export function nextReviewPath(stage: number, root?: string): string;
export function reviewStage(
  stage: number,
  options?: {
    root?: string;
    base?: string;
    call?: (args: { apiKey: string; model: string; baseUrl: string; system: string; user: string }) => Promise<string>;
    env?: Record<string, string | undefined>;
    dry?: boolean;
  },
): Promise<{ path: string | null; verdict: string; text: string; size?: number }>;
