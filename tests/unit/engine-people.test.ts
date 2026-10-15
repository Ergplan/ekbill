import { describe, expect, it } from 'vitest';

import { checkCustomer, fromGstin, offerLanguage } from '../../packages/engine/src/customer';
import { parseCsv } from '../../packages/engine/src/import/csv';
import { dedupeWithin, matchExisting } from '../../packages/engine/src/import/match';
import { checkItem, isHsnSac, lookupHsnSac } from '../../packages/engine/src/item';

/**
 * Stage 5 checks: a customer (the MVP's customer-form.ts, salvaged), an
 * item with its HSN/SAC and rate, the lookup over hsn-index.json, the CSV
 * reader and the "Pehle se hai" matcher.
 */
describe('a customer', () => {
  it('takes the state and the PAN from the GSTIN, the phone in E.164, Hinglish by default', () => {
    const r = checkCustomer({ name: '  Mehta   Traders ', phone: '98765 43210', gstin: '27aapfu0939f1zv' });
    expect(r).toMatchObject({
      ok: true,
      customer: {
        name: 'Mehta Traders',
        phone: '+919876543210',
        gstin: '27AAPFU0939F1ZV',
        stateCode: '27',
        pan: 'AAPFU0939F',
        language: 'hi-Latn',
        languageSource: null,
      },
    });
    expect(fromGstin('27AAPFU0939F1ZV')).toEqual({ stateCode: '27', stateName: 'Maharashtra', pan: 'AAPFU0939F' });
    expect(fromGstin('27AAPFU0939F1ZW')).toBeNull();
  });
  it('needs only a name, and says which field is wrong', () => {
    expect(checkCustomer({ name: 'Asha' }).ok).toBe(true);
    expect(checkCustomer({ name: ' ' })).toMatchObject({
      ok: false,
      field: 'name',
      message: { key: 'error.required' },
    });
    expect(checkCustomer({ name: 'A', phone: '12345' })).toMatchObject({ ok: false, field: 'phone' });
    expect(checkCustomer({ name: 'A', gstin: '27AAPFU0939F1ZW' })).toMatchObject({ ok: false, field: 'gstin' });
    expect(checkCustomer({ name: 'A', gstin: '27AAPFU0939F1ZV', stateCode: '29' })).toMatchObject({
      field: 'stateCode',
    });
    expect(checkCustomer({ name: 'A', gstin: '27AAPFU0939F1ZV', pan: 'ABCDE1234F' })).toMatchObject({ field: 'pan' });
    expect(checkCustomer({ name: 'A', pincode: '0123' })).toMatchObject({ field: 'pincode' });
    expect(checkCustomer({ name: 'A', email: 'nope' })).toMatchObject({ field: 'email' });
    expect(checkCustomer({ name: 'A', language: 'fr' })).toMatchObject({ field: 'language' });
  });
  it('keeps a foreign number written with its plus, and a chosen language as the owner chose it', () => {
    expect(checkCustomer({ name: 'A', phone: '+44 7700 900123', language: 'en' })).toMatchObject({
      ok: true,
      customer: { phone: '+447700900123', language: 'en', languageSource: 'owner' },
    });
  });
  it('offers a language from the name or the state, and nothing for the Hindi belt', () => {
    expect(offerLanguage({ name: 'Ramesh Patil' })).toEqual({ language: 'mr', because: 'Patil' });
    expect(offerLanguage({ name: 'Sharma Electricals', stateCode: '33' })).toEqual({ language: 'ta', because: '33' });
    expect(offerLanguage({ name: 'Ravi Kumar', stateCode: '09' })).toBeNull();
  });
});

describe('an item', () => {
  const TODAY = '2026-10-15';
  it('accepts HSN of 2, 4, 6 or 8 digits and SAC of 6 starting 99', () => {
    expect(['85', '8516', '851610', '85161000', '998719'].every(isHsnSac)).toBe(true);
    expect(['8', '851', '9987', '99871', 'ABCD'].some(isHsnSac)).toBe(false);
  });
  it('holds the rate to the ones in force on the date', () => {
    expect(checkItem({ name: 'Fan', defaultTaxBp: 1800, defaultRatePaise: 135000 }, TODAY)).toMatchObject({
      ok: true,
      item: { name: 'Fan', defaultTaxBp: 1800, defaultRatePaise: 135000, priceIncludesTax: false },
    });
    expect(checkItem({ name: 'Fan', defaultTaxBp: 1200 }, TODAY)).toMatchObject({
      ok: false,
      field: 'defaultTaxBp',
      message: { key: 'error.rate', params: { rates: '0, 5, 18, 40' } },
    });
    expect(checkItem({ name: 'Fan', defaultTaxBp: 1200 }, '2025-09-21').ok).toBe(true);
    expect(checkItem({ name: '' }, TODAY)).toMatchObject({ field: 'name' });
    expect(checkItem({ name: 'Fan', defaultRatePaise: -1 }, TODAY)).toMatchObject({ field: 'defaultRatePaise' });
    expect(checkItem({ name: 'Fan', hsnSac: '123' }, TODAY)).toMatchObject({ field: 'hsnSac' });
  });
  it('finds HSN chapters and SAC headings by code or by words', () => {
    expect(lookupHsnSac('85')[0]).toMatchObject({ kind: 'hsn', code: '85' });
    expect(lookupHsnSac('998719').map((h) => h.code)).toContain('9987');
    const words = lookupHsnSac('repair maintenance');
    expect(words[0]).toMatchObject({ kind: 'sac', code: '9987' });
    expect(lookupHsnSac('')).toEqual([]);
  });
});

describe('a CSV and "Pehle se hai"', () => {
  it('reads quotes, doubled quotes, a BOM, semicolons and blank lines', () => {
    expect(parseCsv('﻿Name,Note\n"Mehta, Traders","said ""hi"""\n\n Asha , x \n')).toEqual([
      ['Name', 'Note'],
      ['Mehta, Traders', 'said "hi"'],
      ['Asha', 'x'],
    ]);
    expect(parseCsv('Name;City\nAsha;Pune\n')).toEqual([
      ['Name', 'City'],
      ['Asha', 'Pune'],
    ]);
  });
  it('matches by GSTIN, then the last ten digits of the phone, then the name', () => {
    const existing = [
      { id: 'a', name: 'Mehta Traders', gstin: '27AAPFU0939F1ZV', phone: '+919822100001' },
      { id: 'b', name: 'Dr. Kulkarni', gstin: null, phone: null },
    ];
    expect(matchExisting({ name: 'Other', gstin: '27AAPFU0939F1ZV', phone: null }, existing)).toBe('a');
    expect(matchExisting({ name: 'Other', gstin: null, phone: '98221 00001' }, existing)).toBe('a');
    expect(matchExisting({ name: 'dr kulkarni', gstin: null, phone: null }, existing)).toBe('b');
    expect(matchExisting({ name: 'New One', gstin: null, phone: '12' }, existing)).toBeNull();
  });
  it('folds the same customer read twice', () => {
    expect(
      dedupeWithin([
        { name: 'Pawar Dairy', gstin: null },
        { name: 'PAWAR DAIRY.', gstin: null },
        { name: 'Rathi', gstin: '27AADCR7788P1ZA' },
        { name: 'Rathi Agro', gstin: '27AADCR7788P1ZA' },
      ]).map((c) => c.name),
    ).toEqual(['Pawar Dairy', 'Rathi']);
  });
});
