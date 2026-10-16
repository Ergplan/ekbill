import { authMode } from '../../server/auth-mode';
import { LoginScreen } from '../../screens/login/Screen';
import { one, type SearchParams } from '../../screens/viewer';

export const dynamic = 'force-dynamic';

/**
 * Sign-in. With AUTH_MODE=otp (Stage 10) the browser gets Firebase's public web config from here,
 * per request (not baked into the bundle); in the build's switcher mode none, and the screen is
 * the approved prototype.
 */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const state = one((await searchParams).state) === 'code' ? 'code' : 'phone';
  const e = process.env;
  const otp =
    authMode() === 'otp' && e.NEXT_PUBLIC_FIREBASE_API_KEY && e.NEXT_PUBLIC_FIREBASE_PROJECT_ID
      ? {
          apiKey: e.NEXT_PUBLIC_FIREBASE_API_KEY,
          authDomain: e.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? `${e.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`,
          projectId: e.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          appId: e.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
          emulatorHost: e.FIREBASE_AUTH_EMULATOR_HOST || null,
        }
      : null;
  return <LoginScreen state={state} otp={otp} />;
}
