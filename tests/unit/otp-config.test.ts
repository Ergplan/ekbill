import { describe, expect, it } from 'vitest';

import { otpConfigOf } from '../../apps/web/server/otp-config';

describe('otpConfigOf (Stage 10 review)', () => {
  const env = { NEXT_PUBLIC_FIREBASE_API_KEY: 'key', NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'ekbill-prod' };

  it('an empty auth domain, as Compose passes it, falls back to the project’s own', () => {
    expect(
      otpConfigOf({ ...env, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: '', FIREBASE_AUTH_EMULATOR_HOST: '' }, true),
    ).toEqual({
      apiKey: 'key',
      authDomain: 'ekbill-prod.firebaseapp.com',
      projectId: 'ekbill-prod',
      appId: '',
      emulatorHost: null,
    });
    expect(otpConfigOf({ ...env, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'login.example.in' }, true)?.authDomain).toBe(
      'login.example.in',
    );
  });

  it('none with OTP off, or without the key or the project', () => {
    expect(otpConfigOf(env, false)).toBeNull();
    expect(otpConfigOf({ ...env, NEXT_PUBLIC_FIREBASE_API_KEY: '' }, true)).toBeNull();
    expect(otpConfigOf({ NEXT_PUBLIC_FIREBASE_API_KEY: 'key' }, true)).toBeNull();
  });
});
