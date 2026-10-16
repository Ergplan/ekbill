import { authMode } from '../../server/auth-mode';
import { otpConfigOf } from '../../server/otp-config';
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
  const otp = otpConfigOf(process.env, authMode() === 'otp');
  return <LoginScreen state={state} otp={otp} />;
}
