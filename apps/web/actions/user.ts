'use server';

import { cookies } from 'next/headers';

import { users, type TenantScope } from '@ekbill/db';

import { log } from '../server/log';
import { current } from '../server/session';
import { languageInput, nameInput, themeInput } from './schema';

/** Every action answers this: the screen shows `error` as it is (a dictionary key), nothing else leaks. */
export type ActionResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

async function scoped(): Promise<{ scope: TenantScope } | { error: string }> {
  const me = await current();
  if (!me) return { error: 'auth.signed.out' };
  if (!me.scope) return { error: 'auth.no.business' };
  return { scope: me.scope };
}

const THEME_COOKIE = 'eb-theme';
const LANG_COOKIE = 'eb-lang';

/** The person's own theme: saved on the user (every role), echoed in the cookie the layout reads before paint. */
export async function setTheme(input: unknown): Promise<ActionResult<{ theme: string }>> {
  const parsed = themeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'form.invalid' };
  const s = await scoped();
  if ('error' in s) return { ok: false, error: s.error };
  const user = await users.setTheme(s.scope, parsed.data.theme);
  (await cookies()).set(THEME_COOKIE, user.theme, { path: '/', maxAge: 31_536_000, sameSite: 'lax' });
  log.info({ requestId: s.scope.requestId, userId: s.scope.userId, theme: user.theme }, 'theme set');
  return { ok: true, value: { theme: user.theme } };
}

export async function setLanguage(input: unknown): Promise<ActionResult<{ language: string }>> {
  const parsed = languageInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'form.invalid' };
  const s = await scoped();
  if ('error' in s) return { ok: false, error: s.error };
  const user = await users.setLanguage(s.scope, parsed.data.language);
  (await cookies()).set(LANG_COOKIE, user.language, { path: '/', maxAge: 31_536_000, sameSite: 'lax' });
  log.info({ requestId: s.scope.requestId, userId: s.scope.userId, language: user.language }, 'language set');
  return { ok: true, value: { language: user.language } };
}

export async function setName(input: unknown): Promise<ActionResult<{ name: string }>> {
  const parsed = nameInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'form.invalid' };
  const s = await scoped();
  if ('error' in s) return { ok: false, error: s.error };
  const user = await users.setName(s.scope, parsed.data.name);
  return { ok: true, value: { name: user.name } };
}
