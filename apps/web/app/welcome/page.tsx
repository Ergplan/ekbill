import { WelcomeScreen } from '../../screens/welcome/Screen';
import { authMode } from '../../server/auth-mode';

export const dynamic = 'force-dynamic';

/** With SMS sign-in off (the switcher), the welcome also offers a real account without a mobile number (20 Oct). */
export default function Page() {
  return <WelcomeScreen guest={authMode() !== 'otp'} />;
}
