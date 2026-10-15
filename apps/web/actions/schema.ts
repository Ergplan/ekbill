import { z } from 'zod';

/**
 * Inputs of the server actions, validated at the boundary (CLAUDE.md:
 * actions validate input, call a repository, return ActionResult). The
 * field trace (scripts/trace.mjs) reads these: each field maps to the
 * column of the same name in the table named below.
 */
// table: users
export const themeInput = z.object({
  theme: z.enum(['narangi', 'harmony', 'system']),
});
// table: users
export const languageInput = z.object({
  language: z.enum(['hi-Latn', 'en']),
});
// table: users
export const nameInput = z.object({
  name: z.string().trim().min(1).max(80),
});
