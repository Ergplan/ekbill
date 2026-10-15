import { customerOf } from '../common';
import type { Viewer } from '../viewer';

export interface CustomerNewData {
  /** The customer being edited (?edit=id), else null for a new one. */
  initial: { name: string; phone: string; gstin: string; lang: 'hi-Latn' | 'en' } | null;
}

export function loadCustomerNew(viewer: Viewer, opts: { edit: string | null }): CustomerNewData | null {
  if (!viewer.business || viewer.role === 'accountant') return null;
  const c = opts.edit ? customerOf(viewer.business, opts.edit) : null;
  return { initial: c ? { name: c.name, phone: c.phone ?? '', gstin: c.gstin ?? '', lang: c.lang } : null };
}
