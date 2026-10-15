import { describe, expect, it } from 'vitest';

import {
  TURNOVER_BAND_PAISE,
  checkProfile,
  formatPhone,
  registrationOf,
  type ProfileInput,
} from '../../packages/engine/src/profile';

/**
 * The Stage 4 checks, with the MVP's profile tests (tests/unit/profile.test.ts,
 * tag mvp-final) adapted: v2 asks the GST status instead of inferring it
 * from the number, and the e-invoicing question only above ₹5 crore.
 */
const good: ProfileInput = {
  name: 'Sharma Electricals',
  gst: 'no',
  phone: '98765 43210',
  upi: 'sharma@upi',
  city: 'Pune',
  stateCode: '27',
};
const regular: ProfileInput = { ...good, gst: 'yes', gstin: '27AAPFU0939F1ZV', stateCode: '', turnoverBand: '40l' };

describe('the profile (Stage 4 checks)', () => {
  it('accepts the setup answers and tidies what it keeps', () => {
    const r = checkProfile({ ...good, name: '  Sharma   Electricals ', city: ' Pune ', upi: ' sharma@upi ' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile).toMatchObject({
      legalName: 'Sharma Electricals',
      tradeName: 'Sharma Electricals',
      registrationType: 'not-registered',
      gstin: null,
      phone: '+919876543210',
      upi: 'sharma@upi',
      city: 'Pune',
      stateCode: '27',
      turnoverBand: null,
      turnoverPaise: null,
      eInvoicingApplies: null,
      defaultPaymentTermsDays: 0,
      look: { design: 'classic', paper: 'a4', shareAs: 'pdf', accent: '#2f4a9e' },
    });
  });
  it('maps the setup answer to the registration type (Haan, Composition, Nahi, Pata nahi)', () => {
    expect(registrationOf('yes')).toBe('regular');
    expect(registrationOf('composition')).toBe('composition');
    expect(registrationOf('no')).toBe('not-registered');
    expect(registrationOf('unknown')).toBe('not-sure');
    expect(registrationOf('regular')).toBe('regular');
    expect(checkProfile({ name: 'X', gst: 'unknown' })).toMatchObject({
      ok: true,
      profile: { registrationType: 'not-sure' },
    });
  });
  it('takes the state and the PAN from the GSTIN, and the band gives the engine its turnover', () => {
    const r = checkProfile({ ...regular, gstin: '27aapfu0939f1zv' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.gstin).toBe('27AAPFU0939F1ZV');
    expect(r.profile.pan).toBe('AAPFU0939F');
    expect(r.profile.stateCode).toBe('27');
    expect(r.profile.registrationType).toBe('regular');
    expect(r.profile.turnoverPaise).toBe(TURNOVER_BAND_PAISE['40l']);
  });
  it('GSTIN checksum: a one-character typo is caught, and a registered business must have one', () => {
    expect(checkProfile({ ...regular, gstin: '27AAPFU0939F1ZW' })).toMatchObject({
      ok: false,
      field: 'gstin',
      message: { key: 'setup.gstin.error.checksum' },
    });
    expect(checkProfile({ ...regular, gstin: '' })).toMatchObject({
      ok: false,
      field: 'gstin',
      message: { key: 'error.gstin.required' },
    });
    expect(checkProfile({ ...regular, gstin: 'NOTAGSTIN' })).toMatchObject({ ok: false, field: 'gstin' });
  });
  it('PAN format, and the PAN inside the GSTIN must equal the PAN typed', () => {
    expect(checkProfile({ ...good, pan: 'ABCDE12345' })).toMatchObject({
      ok: false,
      field: 'pan',
      message: { key: 'error.pan' },
    });
    expect(checkProfile({ ...good, pan: 'abcde1234f' })).toMatchObject({ ok: true, profile: { pan: 'ABCDE1234F' } });
    expect(checkProfile({ ...regular, pan: 'ABCDE1234F' })).toMatchObject({
      ok: false,
      field: 'pan',
      message: { key: 'error.gstinPan', params: { gstPan: 'AAPFU0939F' } },
    });
    expect(checkProfile({ ...regular, pan: 'AAPFU0939F' })).toMatchObject({ ok: true });
  });
  it('will not let the state disagree with the GST number', () => {
    const r = checkProfile({ ...regular, stateCode: '29' });
    expect(r).toMatchObject({ ok: false, field: 'stateCode', message: { key: 'error.gstinState' } });
    if (r.ok) return;
    expect(r.message.params).toEqual({ gstState: 'Maharashtra', chosen: 'Karnataka' });
    expect(checkProfile({ ...good, stateCode: '99' })).toMatchObject({
      ok: false,
      field: 'stateCode',
      message: { key: 'error.state' },
    });
  });
  it('the answer and the number must agree: "Nahi" with a GSTIN typed is a contradiction', () => {
    expect(checkProfile({ ...good, gstin: '27AAPFU0939F1ZV' })).toMatchObject({
      ok: false,
      field: 'gst',
      message: { key: 'error.gstAnswer' },
    });
  });
  it('composition requires the legend, and never a turnover band or the e-invoicing answer', () => {
    const noLegend = checkProfile({ ...regular, gst: 'composition' });
    expect(noLegend).toMatchObject({ ok: false, field: 'compositionLegend', message: { key: 'error.legend' } });
    const r = checkProfile({
      ...regular,
      gst: 'composition',
      compositionLegend: 'composition taxable person, not eligible to collect tax on supplies',
      eInvoicingApplies: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile).toMatchObject({
      registrationType: 'composition',
      turnoverBand: null,
      turnoverPaise: null,
      eInvoicingApplies: null,
    });
    expect(r.profile.compositionLegend).toContain('not eligible');
  });
  it('asks the e-invoicing question only in the "5 crore se zyada" band, and never guesses the answer', () => {
    expect(checkProfile({ ...regular, turnoverBand: '5cr+' })).toMatchObject({
      ok: false,
      field: 'eInvoicingApplies',
      message: { key: 'einv.required' },
    });
    expect(checkProfile({ ...regular, turnoverBand: '5cr+', eInvoicingApplies: false })).toMatchObject({
      ok: true,
      profile: { eInvoicingApplies: false, turnoverPaise: 5_000_000_001 },
    });
    expect(checkProfile({ ...regular, turnoverBand: '5cr+', eInvoicingApplies: true })).toMatchObject({
      ok: true,
      profile: { eInvoicingApplies: true },
    });
    expect(checkProfile({ ...regular, turnoverBand: '1.5-5cr' })).toMatchObject({
      ok: true,
      profile: { eInvoicingApplies: null, turnoverPaise: 5_000_000_000 },
    });
    // A regular business may still be choosing its band.
    expect(checkProfile({ ...regular, turnoverBand: null })).toMatchObject({
      ok: true,
      profile: { turnoverBand: null, turnoverPaise: null },
    });
  });
  it('says which field is wrong, as a dictionary key', () => {
    expect(checkProfile({ ...good, name: '  ' })).toMatchObject({
      ok: false,
      field: 'name',
      message: { key: 'error.required' },
    });
    expect(checkProfile({ ...good, name: 'x'.repeat(121) })).toMatchObject({
      ok: false,
      field: 'name',
      message: { key: 'error.tooLong', params: { n: 120 } },
    });
    expect(checkProfile({ ...good, phone: '12345' })).toMatchObject({
      ok: false,
      field: 'phone',
      message: { key: 'error.phone' },
    });
    expect(checkProfile({ ...good, upi: 'no-at-sign' })).toMatchObject({
      ok: false,
      field: 'upi',
      message: { key: 'error.upi' },
    });
    expect(checkProfile({ ...good, email: 'not-an-email' })).toMatchObject({
      ok: false,
      field: 'email',
      message: { key: 'error.email' },
    });
    expect(checkProfile({ ...good, pincode: '12' })).toMatchObject({
      ok: false,
      field: 'pincode',
      message: { key: 'error.pincode' },
    });
    expect(checkProfile({ ...good, bankAccount: '12', bankIfsc: 'MAHB0000123' })).toMatchObject({
      ok: false,
      field: 'bankAccount',
      message: { key: 'error.account' },
    });
    expect(checkProfile({ ...good, bankAccount: '123456789012', bankIfsc: 'MAHB123' })).toMatchObject({
      ok: false,
      field: 'bankIfsc',
      message: { key: 'error.ifsc' },
    });
    expect(checkProfile({ ...good, bankAccount: '123456789012' })).toMatchObject({
      ok: false,
      field: 'bankIfsc',
      message: { key: 'error.required' },
    });
    expect(checkProfile({ ...good, defaultPaymentTermsDays: 400 })).toMatchObject({
      ok: false,
      field: 'defaultPaymentTermsDays',
      message: { key: 'error.days' },
    });
  });
  it('keeps the bank and the look, with defaults for a look never chosen', () => {
    const r = checkProfile({
      ...good,
      bankName: 'Bank of Maharashtra',
      bankAccount: '1234 5678 9012',
      bankIfsc: 'mahb0000123',
      bankHolder: 'Sharma Electricals',
      pincode: '440010',
      defaultPaymentTermsDays: 15,
      look: { design: 'modern', accent: '#0F766E', paper: 'nope' as never },
      voiceOnArrival: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile).toMatchObject({
      bankAccount: '123456789012',
      bankIfsc: 'MAHB0000123',
      pincode: '440010',
      defaultPaymentTermsDays: 15,
      look: { design: 'modern', accent: '#0f766e', paper: 'a4', shareAs: 'pdf' },
      voiceOnArrival: false,
    });
  });
  it('reads back the way people say numbers', () => {
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
    expect(formatPhone('+447700900123')).toBe('+447700900123');
    expect(formatPhone(null)).toBe('');
  });
});
