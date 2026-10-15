import { NotFoundError, customers } from '@ekbill/db';

import { customerOf } from '../common';
import { customerIdOf } from '../people';
import type { Viewer } from '../viewer';
import type { NewCustomerDraft } from './Screen';

export interface CustomerNewData {
  /** The customer being edited (?edit=id), else null for a new one. */
  initial: NewCustomerDraft | null;
  /** The row id being edited (Stage 5); null for a new customer or a fixture look. */
  id: string | null;
  /** Whether the write goes to the database (a real session) or stays a look. */
  live: boolean;
}

export async function loadCustomerNew(viewer: Viewer, opts: { edit: string | null }): Promise<CustomerNewData | null> {
  if (!viewer.business || viewer.role === 'accountant') return null;
  const scope = viewer.session?.scope;
  if (scope) {
    if (!opts.edit) return { initial: null, id: null, live: true };
    const id = customerIdOf(viewer.business.id, opts.edit);
    if (!id) return null;
    try {
      const c = await customers.getCustomer(scope, id);
      return {
        initial: { name: c.name, phone: c.phone ?? '', gstin: c.gstin ?? '', lang: c.language },
        id: c.id,
        live: true,
      };
    } catch (e) {
      if (e instanceof NotFoundError) return null;
      throw e;
    }
  }
  const c = opts.edit ? customerOf(viewer.business, opts.edit) : null;
  return {
    initial: c ? { name: c.name, phone: c.phone ?? '', gstin: c.gstin ?? '', lang: c.lang } : null,
    id: null,
    live: false,
  };
}
