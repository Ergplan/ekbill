import { describe, expect, it } from 'vitest';

import * as businesses from '../../packages/db/src/repos/businesses';
import * as customers from '../../packages/db/src/repos/customers';
import * as items from '../../packages/db/src/repos/items';
import { scopeFor, seeded } from './helpers';

/**
 * The stage reviews (4, 5 and 6): a save carries only what its screen shows, so it must not reset what another
 * screen set. Aap's "Save karo" sends no bill look; setup sends no bank details; the customer and item screens
 * send a few of their columns.
 */
seeded();

describe('a save keeps what it does not carry', () => {
  it('the profile: a save without a look or bank details keeps them (Stage 4 review)', async () => {
    const owner = await scopeFor('verma', 'owner');
    await businesses.setLook(owner, { design: 'modern', paper: 'a5', shareAs: 'jpg', accent: '#0f766e' });
    const before = await businesses.getProfile(owner);
    await businesses.saveProfile(owner, {
      name: before.legalName,
      gst: before.registrationType,
      gstin: before.gstin,
      bankName: 'State Bank of India',
      bankAccount: '123456789012',
      bankIfsc: 'SBIN0001234',
    });
    // Aap's save: the email changed, nothing else sent.
    const after = await businesses.saveProfile(owner, {
      name: before.legalName,
      gst: before.registrationType,
      gstin: before.gstin,
      email: 'verma@example.com',
    });
    expect(after.look).toEqual({ design: 'modern', paper: 'a5', shareAs: 'jpg', accent: '#0f766e' });
    expect(after.bankAccount).toBe('123456789012');
    expect(after.email).toBe('verma@example.com');
    // An explicit null still clears.
    expect(
      (
        await businesses.saveProfile(owner, {
          name: before.legalName,
          gst: before.registrationType,
          gstin: before.gstin,
          email: null,
        })
      ).email,
    ).toBeNull();
  });
});

describe('a customer or an item edit keeps what its screen does not show (Stages 5 and 6 review)', () => {
  it('the customer: address, State, email, PAN and notes survive a name change', async () => {
    const owner = await scopeFor('verma', 'owner');
    const c = await customers.createCustomer(owner, {
      name: 'Imported Party',
      address: '12, MG Road',
      city: 'Bengaluru',
      pincode: '560001',
      stateCode: '29',
      email: 'party@example.com',
      pan: 'AAAPL1234C',
      notes: 'From the old register',
    });
    // The customer screen's shape: name, phone, GSTIN, language.
    const after = await customers.updateCustomer(owner, c.id, {
      name: 'Imported Party Ltd',
      phone: null,
      gstin: null,
      language: 'hi-Latn',
      languageSource: 'owner',
    });
    expect(after.name).toBe('Imported Party Ltd');
    expect([after.address, after.stateCode, after.email, after.pan, after.notes]).toEqual([
      '12, MG Road',
      '29',
      'party@example.com',
      'AAAPL1234C',
      'From the old register',
    ]);
  });
  it('the item: its description and "price includes GST" survive a rename', async () => {
    const owner = await scopeFor('verma', 'owner');
    const today = '2026-10-15';
    const it = await items.createItem(
      owner,
      { name: 'Annual contract', description: 'Twelve visits', priceIncludesTax: true, defaultTaxBp: 1800 },
      today,
    );
    const after = await items.updateItem(
      owner,
      it.id,
      { name: 'Annual contract (2026)', hsnSac: null, unit: 'nos' },
      today,
    );
    expect([after.description, after.priceIncludesTax, after.defaultTaxBp]).toEqual(['Twelve visits', true, 1800]);
  });
});
