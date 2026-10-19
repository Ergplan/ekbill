import { authMode } from '../../server/auth-mode';
import { LoginScreen } from '../../screens/login/Screen';
import { one, type SearchParams } from '../../screens/viewer';

export const dynamic = 'force-dynamic';

/**
 * Sign-in. With AUTH_MODE=otp the screen asks EkBill's server for the SMS code (Twilio Verify, 19 Oct);
 * in the build's switcher mode the screen is the approved prototype.
 */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const state = one((await searchParams).state) === 'code' ? 'code' : 'phone';
  return <LoginScreen state={state} otp={authMode() === 'otp'} />;
}
