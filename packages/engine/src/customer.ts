import { checkGstin, checkPan } from './ids';
import { guessLanguage, type CustomerLanguage } from './language-guess';
import { toE164 } from './phone';
import { say, type Say } from './say';
import { findState } from './state-codes';

/**
 * "Customer ke baare mein batayen": what the owner knows about a customer,
 * checked the same way in the browser and on the server. Salvaged from the
 * MVP's customer-form.ts (tag mvp-final); messages are dictionary keys.
 *
 * The GST number does the most work: it carries the customer's state (the
 * place of supply the engine reads, so CGST+SGST or IGST) and their PAN.
 */
/** The language a reminder goes out in: Hinglish (the default), English, or the customer's own. */
export const CUSTOMER_LANGUAGES = ['hi-Latn', 'en', 'hi', 'mr', 'gu', 'ta', 'te', 'kn', 'bn'] as const;
export type CustomerLanguageCode = (typeof CUSTOMER_LANGUAGES)[number];

export interface CustomerInput {
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  pan?: string | null;
  address?: string | null;
  city?: string | null;
  pincode?: string | null;
  stateCode?: string | null;
  language?: string | null;
  /** owner: chosen; guess: offered by guessLanguage and accepted. Null when no language was set. */
  languageSource?: 'owner' | 'guess' | null;
  notes?: string | null;
}
export type CustomerField = keyof CustomerInput;

export interface CustomerClean {
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  pan: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
  stateCode: string | null;
  language: CustomerLanguageCode;
  languageSource: 'owner' | 'guess' | null;
  notes: string | null;
}
export type CustomerCheck = { ok: true; customer: CustomerClean } | { ok: false; field: CustomerField; message: Say };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clean(v: string | null | undefined, max: number): string | null {
  const s = (v ?? '').trim().replace(/\s+/g, ' ');
  return s ? s.slice(0, max) : null;
}

export function checkCustomer(input: CustomerInput): CustomerCheck {
  const fail = (field: CustomerField, key: string, params?: Record<string, string | number>): CustomerCheck => ({
    ok: false,
    field,
    message: say(key, params),
  });
  const name = clean(input.name, 200);
  if (!name) return fail('name', 'error.required');

  let phone: string | null = null;
  if (clean(input.phone, 30)) {
    phone = toE164(input.phone);
    if (!phone) return fail('phone', 'error.phone');
  }
  const email = clean(input.email, 120);
  if (email && !EMAIL.test(email)) return fail('email', 'error.email');

  let stateCode = clean(input.stateCode, 2);
  if (stateCode && !findState(stateCode)) return fail('stateCode', 'error.state');

  let gstin: string | null = null;
  const rawGstin = (input.gstin ?? '').trim();
  if (rawGstin) {
    const c = checkGstin(rawGstin);
    if (!c.ok)
      return fail('gstin', `setup.gstin.error.${c.problem === 'unknown-state' ? 'state' : (c.problem ?? 'format')}`);
    gstin = c.normalised;
    if (stateCode && stateCode !== c.stateCode)
      return fail('stateCode', 'error.gstinState', {
        gstState: c.stateName ?? '',
        chosen: findState(stateCode)?.name ?? stateCode,
      });
    stateCode = c.stateCode ?? stateCode;
  }

  let pan: string | null = null;
  const rawPan = (input.pan ?? '').trim();
  if (rawPan) {
    const c = checkPan(rawPan);
    if (!c.ok) return fail('pan', 'error.pan');
    pan = c.normalised;
    // A GSTIN has the PAN inside it (characters 3 to 12); if both are given they must agree.
    if (gstin && gstin.slice(2, 12) !== pan) return fail('pan', 'error.gstinPan', { gstPan: gstin.slice(2, 12) });
  } else if (gstin) {
    pan = gstin.slice(2, 12);
  }

  const pincode = clean(input.pincode, 10)?.replace(/\s/g, '') ?? null;
  if (pincode && !/^[1-9]\d{5}$/.test(pincode)) return fail('pincode', 'error.pincode');

  const raw = clean(input.language, 10);
  if (raw && !(CUSTOMER_LANGUAGES as readonly string[]).includes(raw)) return fail('language', 'error.required');
  const language = (raw as CustomerLanguageCode | null) ?? 'hi-Latn';

  return {
    ok: true,
    customer: {
      name,
      contactPerson: clean(input.contactPerson, 100),
      phone,
      email,
      gstin,
      pan,
      address: clean(input.address, 200),
      city: clean(input.city, 100),
      pincode,
      stateCode,
      language,
      languageSource: raw ? (input.languageSource ?? 'owner') : null,
      notes: clean(input.notes, 500),
    },
  };
}

/** What a GSTIN says about its holder: the state and the PAN, for the form to fill as the owner types. */
export function fromGstin(
  gstin: string | null | undefined,
): { stateCode: string; stateName: string; pan: string } | null {
  const c = checkGstin(gstin);
  return c.ok && c.stateCode && c.pan ? { stateCode: c.stateCode, stateName: c.stateName ?? '', pan: c.pan } : null;
}

/**
 * The language to offer for a new customer: the guess from their name or
 * place, mapped to a reminder language; null when there is nothing to go on.
 * Offered, never applied on its own.
 */
export function offerLanguage(args: {
  name: string;
  contactPerson?: string | null;
  city?: string | null;
  stateCode?: string | null;
}): { language: CustomerLanguageCode; because: string } | null {
  const g = guessLanguage(args);
  if (!g) return null;
  const map: Record<CustomerLanguage, CustomerLanguageCode> = {
    hi: 'hi',
    en: 'en',
    mr: 'mr',
    gu: 'gu',
    ta: 'ta',
    te: 'te',
    kn: 'kn',
    bn: 'bn',
  };
  return { language: map[g.language], because: g.because };
}
