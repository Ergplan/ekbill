'use client';

import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  RecaptchaVerifier,
  connectAuthEmulator,
  getAuth,
  signInWithPhoneNumber,
  type Auth,
  type ConfirmationResult,
} from 'firebase/auth';

/**
 * Phone OTP in the browser (Stage 10; the MVP's src/lib/firebase/client.ts).
 * Firebase sends the SMS and checks the code; the browser's job ends with an
 * ID token, posted once to /api/auth/otp, which makes EkBill's own session.
 * The config comes from the server per request (not baked into the bundle).
 * With an emulator host (CI only), the reCAPTCHA is a stand-in and the code
 * is read from the emulator.
 */
export interface OtpConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  /** "127.0.0.1:9099" in CI; never set in production. */
  emulatorHost: string | null;
}

let auth: Auth | null = null;
let verifier: RecaptchaVerifier | null = null;

function authOf(config: OtpConfig): Auth {
  if (auth) return auth;
  const app = getApps().length
    ? getApp()
    : initializeApp({
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        projectId: config.projectId,
        appId: config.appId,
      });
  auth = getAuth(app);
  auth.languageCode = 'hi';
  if (config.emulatorHost) connectAuthEmulator(auth, `http://${config.emulatorHost}`, { disableWarnings: true });
  return auth;
}

/** Sends the SMS. `buttonId` is the element the invisible reCAPTCHA hangs on. */
export async function sendCode(config: OtpConfig, phoneE164: string, buttonId: string): Promise<ConfirmationResult> {
  const a = authOf(config);
  verifier ??= new RecaptchaVerifier(a, buttonId, { size: 'invisible' });
  return signInWithPhoneNumber(a, phoneE164, verifier);
}

/** Checks the code and exchanges Firebase's token for EkBill's session; answers where to go next. */
export async function confirmCode(confirmation: ConfirmationResult, code: string): Promise<string> {
  const cred = await confirmation.confirm(code);
  const idToken = await cred.user.getIdToken();
  const res = await fetch('/api/auth/otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  const body = (await res.json().catch(() => ({}))) as { to?: string; error?: string };
  if (!res.ok || !body.to) throw new Error(body.error ?? 'otp.invalid');
  // Firebase's own sign-in is not kept: EkBill's session cookie is the identity from here.
  await auth?.signOut().catch(() => undefined);
  return body.to;
}
