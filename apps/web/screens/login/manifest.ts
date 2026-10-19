import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'login',
  route: '/login',
  title: 'Login',
  purpose: 'Phone, then the SMS code. The code fills itself in and moves on; no password anywhere.',
  primary: { label: 'Aage', to: '/setup/[step]', guide: 'next' },
  taps: [
    { label: 'Peeche', to: '/welcome', guide: 'back' },
    { label: 'Build ke dauran: /dev/switch se koi bhi bano', to: '/dev/switch' },
  ],
  states: ['phone', 'code'],
  guides: ['phone', 'next', 'code', 'resend'],
  // The resend button shows once the 30 seconds are up, with sign-in on (19 Oct).
  optionalGuides: ['code', 'resend'],
  tour: [
    { target: 'phone', say: 'Apna phone number likho. Isi se login hota hai.' },
    { target: 'next', say: 'Aage dabao, SMS se code aayega.' },
  ],
  roles: { owner: 'Everyone signs in the same way.', staff: 'Same.', accountant: 'Same.' },
  reference: { narangi: '01-login' },
};
