'use server';

import { cookies } from 'next/headers';

import { DEMO_VERSION, setOwnSettings, users, type TenantScope } from '@ekbill/db';

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
  // Someone with no business yet (the demo's language at first sign-in, 20 Oct) sets it on their own row.
  const me = await current();
  if (me && !me.scope) {
    await setOwnSettings(me.user.id, { language: parsed.data.language });
    (await cookies()).set(LANG_COOKIE, parsed.data.language, { path: '/', maxAge: 31_536_000, sameSite: 'lax' });
    return { ok: true, value: { language: parsed.data.language } };
  }
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

/**
 * The app demo seen, finished or declined (20 Oct): it is not offered again until DEMO_VERSION moves. Signed out
 * (the welcome screen's demo), nothing is kept.
 */
export async function markDemoSeen(): Promise<ActionResult<{ version: number }>> {
  const me = await current();
  if (!me) return { ok: true, value: { version: 0 } };
  await setOwnSettings(me.user.id, { demoSeenVersion: DEMO_VERSION });
  return { ok: true, value: { version: DEMO_VERSION } };
}
