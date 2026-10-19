'use server';

import { revalidatePath } from 'next/cache';

import { ForbiddenError, NEW_MEMBER_NAME, NotFoundError, memberships } from '@ekbill/db';
import { toE164 } from '@ekbill/engine';

import { log } from '../server/log';
import { current } from '../server/session';
import { inviteInput, memberInput } from './schema';

/**
 * Stage 9's team writes (owner only, enforced by the repository): invite by
 * phone with a role, change a role, remove. The invite waits until that
 * phone signs in; the screen hands the owner a WhatsApp message to send.
 */
export type TeamResult<T> = { ok: true; value: T } | { ok: false; error: string };

async function owner() {
  const me = await current();
  if (!me?.scope) return { error: 'auth.signed.out' } as const;
  return { scope: me.scope } as const;
}
function refused(e: unknown): { ok: false; error: string } {
  if (e instanceof memberships.TeamError) return { ok: false, error: `team.error.${e.code}` };
  if (e instanceof ForbiddenError) return { ok: false, error: 'auth.forbidden' };
  if (e instanceof NotFoundError) return { ok: false, error: 'error.notFound' };
  throw e;
}

export async function inviteMember(input: unknown): Promise<TeamResult<{ userId: string; phone: string }>> {
  const parsed = inviteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'error.phone' };
  const phone = toE164(parsed.data.phone);
  if (!phone) return { ok: false, error: 'error.phone' };
  const s = await owner();
  if ('error' in s) return { ok: false, error: s.error! };
  try {
    const m = await memberships.invite(s.scope, {
      phoneE164: phone,
      name: parsed.data.name?.trim() || NEW_MEMBER_NAME,
      role: parsed.data.role,
    });
    log.info({ requestId: s.scope.requestId, role: m.role, status: m.status }, 'member invited');
    revalidatePath('/aap/team');
    return { ok: true, value: { userId: m.userId, phone } };
  } catch (e) {
    return refused(e);
  }
}

export async function changeMemberRole(input: unknown): Promise<TeamResult<undefined>> {
  const parsed = memberInput.safeParse(input);
  if (!parsed.success || !parsed.data.role) return { ok: false, error: 'form.invalid' };
  const s = await owner();
  if ('error' in s) return { ok: false, error: s.error! };
  try {
    await memberships.changeRole(s.scope, { userId: parsed.data.userId, role: parsed.data.role });
    revalidatePath('/aap/team');
    return { ok: true, value: undefined };
  } catch (e) {
    return refused(e);
  }
}

export async function removeMember(input: unknown): Promise<TeamResult<undefined>> {
  const parsed = memberInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'form.invalid' };
  const s = await owner();
  if ('error' in s) return { ok: false, error: s.error! };
  try {
    await memberships.remove(s.scope, { userId: parsed.data.userId });
    revalidatePath('/aap/team');
    return { ok: true, value: undefined };
  } catch (e) {
    return refused(e);
  }
}
