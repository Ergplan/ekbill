import type { OtpConfig } from '../screens/login/firebase';

/**
 * Firebase's public web config for the login screen, from the environment; null unless OTP is on and the key and
 * project are set. An empty value counts as unset (Stage 10 review: Compose passes `VAR=` through as '', and an
 * empty auth domain left the browser unable to sign in), so the auth domain falls back to the project's own.
 */
export function otpConfigOf(e: Record<string, string | undefined>, otpOn: boolean): OtpConfig | null {
  if (!otpOn || !e.NEXT_PUBLIC_FIREBASE_API_KEY || !e.NEXT_PUBLIC_FIREBASE_PROJECT_ID) return null;
  return {
    apiKey: e.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: e.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || `${e.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`,
    projectId: e.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: e.NEXT_PUBLIC_FIREBASE_APP_ID || '',
    emulatorHost: e.FIREBASE_AUTH_EMULATOR_HOST || null,
  };
}
