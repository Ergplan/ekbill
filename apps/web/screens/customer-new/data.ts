import { customerOf } from '../common';
import type { Viewer } from '../viewer';
import type { NewCustomerDraft } from './Screen';

/** The customer being changed (`?edit=<id>`), as the form's initial values; null for a new one. */
export function loadCustomerNew(viewer: Viewer, edit: string | null): NewCustomerDraft | null {
  const c = viewer.business && edit ? customerOf(viewer.business, edit) : null;
  return c ? { name: c.name, phone: c.phone ?? '', gstin: c.gstin ?? '', lang: c.lang } : null;
}
