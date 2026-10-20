'use server';

import { revalidatePath } from 'next/cache';

import { ForbiddenError, NotFoundError, customers, imports, items, type TenantScope } from '@ekbill/db';
import { todayIst, type CustomerInput, type Say } from '@ekbill/engine';

import { log } from '../server/log';
import { current } from '../server/session';
import {
  archiveCustomerInput,
  archiveItemInput,
  commitImportInput,
  customerInput,
  customerPhoneInput,
  itemInput,
} from './schema';
import type { ActionResult } from './user';

/**
 * Stage 5's writes: customers, items, and the import's "add karo". Each
 * validates the shape (zod), calls one repository function (which runs the
 * engine's check and the roles), and answers an ActionResult; a refusal
 * names the field and the dictionary key.
 */
export type PeopleResult<T> = ActionResult<T> | { ok: false; error: string; field?: string; say?: Say };

async function scoped(): Promise<{ scope: TenantScope } | { error: string }> {
  const me = await current();
  if (!me) return { error: 'auth.signed.out' };
  if (!me.scope) return { error: 'auth.no.business' };
  return { scope: me.scope };
}
function refused(e: unknown): { ok: false; error: string; field?: string; say?: Say } {
  if (e instanceof customers.CustomerError) return { ok: false, error: e.say.key, field: e.field, say: e.say };
  if (e instanceof items.ItemError) return { ok: false, error: e.say.key, field: e.field, say: e.say };
  if (e instanceof imports.ImportError) return { ok: false, error: `import.error.${e.code}` };
  if (e instanceof ForbiddenError) return { ok: false, error: 'auth.forbidden' };
  if (e instanceof NotFoundError) return { ok: false, error: 'error.notFound' };
  throw e;
}

export async function saveCustomer(input: unknown): Promise<PeopleResult<{ id: string }>> {
  const parsed = customerInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'form.invalid' };
  const s = await scoped();
  if ('error' in s) return { ok: false, error: s.error };
  const { id, ...data } = parsed.data;
  try {
    const row = id ? await customers.updateCustomer(s.scope, id, data) : await customers.createCustomer(s.scope, data);
    log.info({ requestId: s.scope.requestId, customerId: row.id, created: !id }, 'customer saved');
    revalidatePath('/customers');
    return { ok: true, value: { id: row.id } };
  } catch (e) {
    return refused(e);
  }
}

/**
 * The number typed where a bill goes to WhatsApp (20 Oct: a new customer's number is often not in the shop's
 * phone), kept on the customer for the next bill. Only the number changes; the engine checks it as the customer
 * screen does, and a number another customer has is refused in words.
 */
export async function rememberPhone(input: unknown): Promise<PeopleResult<{ phone: string | null }>> {
  const parsed = customerPhoneInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'form.invalid' };
  const s = await scoped();
  if ('error' in s) return { ok: false, error: s.error };
  try {
    const row = await customers.updateCustomer(s.scope, parsed.data.id, { phone: parsed.data.phone } as CustomerInput);
    log.info({ requestId: s.scope.requestId, customerId: row.id }, 'customer phone kept from the WhatsApp step');
    revalidatePath('/customers');
    return { ok: true, value: { phone: row.phone } };
  } catch (e) {
    return refused(e);
  }
}

export async function setCustomerArchived(input: unknown): Promise<PeopleResult<undefined>> {
  const parsed = archiveCustomerInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'form.invalid' };
  const s = await scoped();
  if ('error' in s) return { ok: false, error: s.error };
  try {
    await customers.archiveCustomer(s.scope, parsed.data.id, parsed.data.archived);
    revalidatePath('/customers');
    return { ok: true, value: undefined };
  } catch (e) {
    return refused(e);
  }
}

export async function saveItem(input: unknown): Promise<PeopleResult<{ id: string }>> {
  const parsed = itemInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'form.invalid' };
  const s = await scoped();
  if ('error' in s) return { ok: false, error: s.error };
  const { id, ...data } = parsed.data;
  const today = todayIst(new Date());
  try {
    const row = id ? await items.updateItem(s.scope, id, data, today) : await items.createItem(s.scope, data, today);
    revalidatePath('/items');
    return { ok: true, value: { id: row.id } };
  } catch (e) {
    return refused(e);
  }
}

export async function setItemArchived(input: unknown): Promise<PeopleResult<undefined>> {
  const parsed = archiveItemInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'form.invalid' };
  const s = await scoped();
  if ('error' in s) return { ok: false, error: s.error };
  try {
    await items.archiveItem(s.scope, parsed.data.id, parsed.data.archived);
    revalidatePath('/items');
    return { ok: true, value: undefined };
  } catch (e) {
    return refused(e);
  }
}

/** "N customers add karo": the ticked rows become customers (I6: only what the owner ticked). */
export async function commitImport(input: unknown): Promise<PeopleResult<{ added: number; linked: number }>> {
  const parsed = commitImportInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'form.invalid' };
  const s = await scoped();
  if ('error' in s) return { ok: false, error: s.error };
  try {
    const r = await imports.commitImport(s.scope, parsed.data.importId, parsed.data.rowIds);
    log.info({ requestId: s.scope.requestId, importId: parsed.data.importId, ...r }, 'import committed');
    revalidatePath('/customers');
    return { ok: true, value: r };
  } catch (e) {
    return refused(e);
  }
}
