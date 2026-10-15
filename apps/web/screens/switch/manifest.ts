import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'switch',
  route: '/dev/switch',
  title: 'Dev switch',
  purpose: 'The build’s door while sign-in is off: become any seeded person with their business and role.',
  taps: [{ label: 'Sharma ji', to: '/', guide: 'people' }],
  states: ['default'],
  guides: ['people'],
  tour: [{ target: 'people', say: 'Build ke dauran: kisi bhi naam pe tap karke wahi ban jao.' }],
  roles: { owner: 'Lists everyone.', staff: 'Same.', accountant: 'Same.' },
};
