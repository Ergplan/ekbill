import type { CivilDate } from '../dates';

/**
 * A customer read out of an old bill or a spreadsheet, before anyone has
 * said it is right (salvaged from the MVP's lib/import/types.ts). Everything
 * here is a candidate: the owner sees each one with what it was read from,
 * and adds the ones they tick (I6: nothing lands on its own).
 */
export interface ImportedCustomer {
  name: string;
  contactPerson: string | null;
  phone: string | null;
  gstin: string | null;
  pan: string | null;
  addressLine1: string | null;
  city: string | null;
  pincode: string | null;
  stateCode: string | null;
  /** The bill this came from, when read from one. Shown as evidence, not imported. */
  bill: { number: string | null; date: CivilDate | null; totalPaise: number | null } | null;
  /** Where the name was read from: a label it followed, a column it was in. */
  source: string;
  /** 'high' when a label or a GSTIN pinned it; 'low' when it is a guess from the layout. */
  confidence: 'high' | 'low';
}
