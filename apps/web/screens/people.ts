import 'server-only';

import { seedCustomerId, seedCustomerKey, type Customer as CustomerRow, type Item as ItemRow } from '@ekbill/db';
import { findState, isUuid } from '@ekbill/engine';

import { FIXTURE, type Customer, type Item } from './fixtures';

/**
 * Stage 5: customers and items are rows now. These map a row to the shape
 * the Stage 1 screens draw (fixtures.ts), so the screens change only where
 * they write. The seeded rows carry ids derived from the fixture keys
 * (packages/db/src/seed.ts), which is how the still-fixture bills of Stage 6
 * find their customer.
 */
export function fixtureKeyOf(id: string): string | null {
  return seedCustomerKey(id)?.customer ?? null;
}
/** The row id a fixture key (or an id) names, for a business by its seed key. */
export function customerIdOf(businessKey: string, idOrKey: string): string | null {
  if (isUuid(idOrKey)) return idOrKey;
  return seedCustomerId(businessKey, idOrKey);
}
/** The avatar colour: the fixture's position for a seeded customer, else a hash of the id. */
export function avatarIndex(id: string): number {
  const key = seedCustomerKey(id);
  if (key) return FIXTURE.customers.filter((c) => c.business === key.business).findIndex((c) => c.id === key.customer);
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 8;
}

export interface CustomerView extends Customer {
  /** The full language (a reminder language), where the fixture shape only knows Hinglish or English. */
  language: string;
  email: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
  archived: boolean;
}
export function customerViewOf(row: CustomerRow, businessKey: string): CustomerView {
  return {
    id: row.id,
    business: businessKey,
    name: row.name,
    contact: row.contactPerson ?? '',
    phone: row.phone,
    gstin: row.gstin,
    pan: row.pan,
    stateCode: row.stateCode,
    stateName: findState(row.stateCode)?.name ?? null,
    lang: row.language === 'en' ? 'en' : 'hi-Latn',
    notes: row.notes,
    language: row.language,
    email: row.email,
    address: row.address,
    city: row.city,
    pincode: row.pincode,
    archived: row.archived,
  };
}
export function itemViewOf(row: ItemRow, businessKey: string): Item {
  return {
    id: row.id,
    business: businessKey,
    name: row.name,
    hsn: row.hsnSac ?? '',
    unit: row.unit ?? '',
    ratePaise: row.defaultRatePaise ?? 0,
    gstRate: row.defaultTaxBp === null ? null : row.defaultTaxBp / 100,
  };
}
