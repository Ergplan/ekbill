import { describe, expect, it } from 'vitest';

import { guessLanguage } from '../../packages/engine/src/language-guess';
import { toE164, whatsappLink } from '../../packages/engine/src/phone';

/** Salvaged from the MVP's language-guess, profile and whatsapp tests (tag mvp-final). */
describe('guessing the language', () => {
  it('reads a surname', () => {
    expect(guessLanguage({ name: 'Ramesh Patil' })).toEqual({ language: 'mr', reason: 'name', because: 'Patil' });
    expect(guessLanguage({ name: 'Nilesh Patel' })?.language).toBe('gu');
    expect(guessLanguage({ name: 'S. Murugan' })?.language).toBe('ta');
    expect(guessLanguage({ name: 'Srinivas Reddy' })?.language).toBe('te');
    expect(guessLanguage({ name: 'Manjunath Gowda' })?.language).toBe('kn');
    expect(guessLanguage({ name: 'Anirban Chatterjee' })?.language).toBe('bn');
  });
  it('prefers the person the owner talks to at a shop', () => {
    expect(guessLanguage({ name: 'Green Park Society', contactPerson: 'Vinod Patil' })?.language).toBe('mr');
  });
  it('falls back to the place, but never guesses for Mumbai or the Hindi belt', () => {
    expect(guessLanguage({ name: 'Sharma Electricals', city: 'Coimbatore' })).toEqual({
      language: 'ta',
      reason: 'place',
      because: 'Coimbatore',
    });
    expect(guessLanguage({ name: 'Sharma Electricals', city: 'Mumbai' })).toBeNull();
    expect(guessLanguage({ name: 'Sharma Electricals', stateCode: '27' })).toBeNull();
    expect(guessLanguage({ name: 'Sharma Electricals', stateCode: '09' })).toBeNull();
    expect(guessLanguage({ name: 'Sharma Electricals', stateCode: '33' })?.language).toBe('ta');
  });
  it('lets a name win over a place', () => {
    expect(guessLanguage({ name: 'Kirit Patel', city: 'Chennai' })?.language).toBe('gu');
  });
  it('says nothing when it has nothing to go on', () => {
    expect(guessLanguage({ name: 'Ravi Kumar' })).toBeNull();
    expect(guessLanguage({ name: 'Ravi Kumar', city: 'Delhi' })).toBeNull();
  });
});

describe('phone numbers the way people write them', () => {
  it('takes the ten digits however they are typed and stores +91', () => {
    expect(toE164('9876543210')).toBe('+919876543210');
    expect(toE164('98765 43210')).toBe('+919876543210');
    expect(toE164('+91 98765-43210')).toBe('+919876543210');
    expect(toE164('09876543210')).toBe('+919876543210');
    expect(toE164('919876543210')).toBe('+919876543210');
  });
  it('refuses what is not a phone number, and an Indian mobile that cannot exist', () => {
    expect(toE164('12345')).toBeNull();
    expect(toE164('1234567890')).toBeNull();
    expect(toE164('')).toBeNull();
    expect(toE164(null)).toBeNull();
    expect(toE164('+91 12345 67890')).toBeNull();
  });
  // Stage 11 review: the trunk 0 after +91 was kept, and +9109876543210 (13 digits, no such number) was stored and
  // put in wa.me links and the phone sign-in.
  it('drops the trunk 0 after +91, reads 0091 as +91, and refuses an Indian number of the wrong length', () => {
    expect(toE164('+91 098765 43210')).toBe('+919876543210');
    expect(toE164('+91-0-9876543210')).toBe('+919876543210');
    expect(toE164('0091 98765 43210')).toBe('+919876543210');
    expect(toE164('+91 98765 4321')).toBeNull();
    expect(toE164('+91 98765 432100')).toBeNull();
    expect(toE164('0044 7700 900123')).toBe('+447700900123');
  });
  it('keeps another country code when it is written with the plus', () => {
    // v2 accepts a foreign customer's number; the MVP refused it.
    expect(toE164('+44 7700 900123')).toBe('+447700900123');
    expect(toE164('+1 (415) 555-0100')).toBe('+14155550100');
  });
  it('opens the customer chat with the message typed in', () => {
    expect(whatsappLink('98765 43210', 'Namaste Patil ji 🙏')).toBe(
      'https://wa.me/919876543210?text=Namaste%20Patil%20ji%20%F0%9F%99%8F',
    );
    expect(whatsappLink('+91 98765-43210', 'hi')).toBe('https://wa.me/919876543210?text=hi');
  });
  it('falls back to the chat picker without a usable number', () => {
    expect(whatsappLink(null, 'hi')).toBe('https://wa.me/?text=hi');
    expect(whatsappLink('12345', 'hi')).toBe('https://wa.me/?text=hi');
  });
});
