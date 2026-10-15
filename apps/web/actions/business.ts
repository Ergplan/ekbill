'use server';

import { revalidatePath } from 'next/cache';

import { adoptBusiness, businesses, files, series, type TenantScope } from '@ekbill/db';
import { ForbiddenError, NotFoundError } from '@ekbill/db';
import { FILE_LIMITS, type Say } from '@ekbill/engine';

import { log } from '../server/log';
import { current } from '../server/session';
import { defaultSeriesInput, fileInput, lookInput, profileInput, seriesInput, seriesPatchInput } from './schema';
import type { ActionResult } from './user';

/**
 * The owner's writes of Stage 4 (owner only, enforced in the repositories by
 * allowedRoles; the actions validate the shape, call one repository
 * function and answer an ActionResult). A profile refusal names the field
 * and the dictionary key, so the form can point at it.
 */
export type ProfileResult<T> = ActionResult<T> | { ok: false; error: string; field?: string; say?: Say };

async function scoped(): Promise<{ scope: TenantScope } | { error: string }> {
  const me = await current();
  if (!me) return { error: 'auth.signed.out' };
  if (!me.scope) return { error: 'auth.no.business' };
  return { scope: me.scope };
}

function refused(e: unknown): { ok: false; error: string; field?: string; say?: Say } {
  if (e instanceof businesses.ProfileError) return { ok: false, error: e.say.key, field: e.field, say: e.say };
  if (e instanceof files.FileError) return { ok: false, error: `error.file.${e.problem}` };
  if (e instanceof series.SeriesError) return { ok: false, error: `aap.series.error.${e.problem}` };
  if (e instanceof ForbiddenError) return { ok: false, error: 'auth.forbidden' };
  if (e instanceof NotFoundError) return { ok: false, error: 'error.notFound' };
  throw e;
}

const asProfileInput = (p: ReturnType<typeof profileInput.parse>) => ({ ...p, name: p.legalName });

/**
 * "Chalo, shuru karte hain": a brand-new owner's business is created with the
 * profile and the session now acts for it; an owner who already has one
 * (running the setup again) saves the profile on it.
 */
export async function finishSetup(input: unknown): Promise<ProfileResult<{ businessId: string }>> {
  const parsed = profileInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'form.invalid' };
  const me = await current();
  if (!me) return { ok: false, error: 'auth.signed.out' };
  try {
    if (me.scope) {
      if (me.scope.role !== 'owner') return { ok: false, error: 'auth.forbidden' };
      const saved = await businesses.saveProfile(me.scope, asProfileInput(parsed.data));
      log.info({ requestId: me.scope.requestId, businessId: saved.id }, 'setup saved on the existing business');
      revalidatePath('/', 'layout');
      return { ok: true, value: { businessId: saved.id } };
    }
    const requestId = `${me.sessionId}-setup`;
    const created = await businesses.createBusiness({ userId: me.user.id, requestId }, asProfileInput(parsed.data));
    await adoptBusiness(me.sessionId, me.user.id, created.id);
    log.info({ requestId, businessId: created.id, userId: me.user.id }, 'business created by setup');
    revalidatePath('/', 'layout');
    return { ok: true, value: { businessId: created.id } };
  } catch (e) {
    return refused(e);
  }
}

export async function saveProfile(input: unknown): Promise<ProfileResult<{ updatedAt: string }>> {
  const parsed = profileInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'form.invalid' };
  const s = await scoped();
  if ('error' in s) return { ok: false, error: s.error };
  try {
    const saved = await businesses.saveProfile(s.scope, asProfileInput(parsed.data));
    log.info({ requestId: s.scope.requestId, businessId: saved.id }, 'profile saved');
    revalidatePath('/', 'layout');
    return { ok: true, value: { updatedAt: saved.updatedAt.toISOString() } };
  } catch (e) {
    return refused(e);
  }
}

export async function saveLook(input: unknown): Promise<ProfileResult<undefined>> {
  const parsed = lookInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'form.invalid' };
  const s = await scoped();
  if ('error' in s) return { ok: false, error: s.error };
  try {
    const d = parsed.data;
    await businesses.setLook(s.scope, {
      design: d.billDesign,
      paper: d.billPaper,
      shareAs: d.billShareAs,
      accent: d.billAccent,
    });
    revalidatePath('/aap');
    return { ok: true, value: undefined };
  } catch (e) {
    return refused(e);
  }
}

/** The logo or the signature: stored as a business file and pointed at (null takes it off). */
export async function setBusinessFile(input: unknown): Promise<ProfileResult<{ fileId: string | null }>> {
  const parsed = fileInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'form.invalid' };
  const s = await scoped();
  if ('error' in s) return { ok: false, error: s.error };
  try {
    const p = await businesses.setFile(s.scope, parsed.data.kind, parsed.data.dataUrl);
    const fileId = parsed.data.kind === 'logo' ? p.logoFileId : p.signatureFileId;
    log.info({ requestId: s.scope.requestId, kind: parsed.data.kind, fileId }, 'business file set');
    revalidatePath('/', 'layout');
    return { ok: true, value: { fileId } };
  } catch (e) {
    const r = refused(e);
    return r.error === 'error.file.too-big'
      ? { ...r, say: { key: r.error, params: { kb: Math.round(FILE_LIMITS[parsed.data.kind].maxBytes / 1024) } } }
      : r;
  }
}

export async function addSeries(input: unknown): Promise<ProfileResult<{ id: string }>> {
  const parsed = seriesInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'form.invalid' };
  const s = await scoped();
  if ('error' in s) return { ok: false, error: s.error };
  try {
    const created = await series.createSeries(s.scope, parsed.data);
    revalidatePath('/aap');
    return { ok: true, value: { id: created.id } };
  } catch (e) {
    return refused(e);
  }
}

export async function changeSeries(input: unknown): Promise<ProfileResult<undefined>> {
  const parsed = seriesPatchInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'form.invalid' };
  const s = await scoped();
  if ('error' in s) return { ok: false, error: s.error };
  try {
    const { id, ...patch } = parsed.data;
    await series.updateSeries(s.scope, id, patch);
    revalidatePath('/aap');
    return { ok: true, value: undefined };
  } catch (e) {
    return refused(e);
  }
}

export async function chooseDefaultSeries(input: unknown): Promise<ProfileResult<undefined>> {
  const parsed = defaultSeriesInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'form.invalid' };
  const s = await scoped();
  if ('error' in s) return { ok: false, error: s.error };
  try {
    await businesses.setDefaultSeries(s.scope, parsed.data.defaultSeriesId);
    revalidatePath('/aap');
    return { ok: true, value: undefined };
  } catch (e) {
    return refused(e);
  }
}
