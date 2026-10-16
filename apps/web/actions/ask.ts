'use server';

import { askRecords, type AskResult } from '../server/ask';
import { current } from '../server/session';
import { askInput } from './schema';

/** Poocho's question (every member). */
export async function ask(input: unknown): Promise<{ ok: true; value: AskResult } | { ok: false; error: string }> {
  const parsed = askInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'ask.error.short' };
  const me = await current();
  if (!me?.scope) return { ok: false, error: 'auth.signed.out' };
  return { ok: true, value: await askRecords(me.scope, parsed.data.question) };
}
