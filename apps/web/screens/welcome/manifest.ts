import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'welcome',
  route: '/welcome',
  title: 'Welcome',
  purpose: 'The pack’s hero: the promise in one line, one way in.',
  primary: { label: 'Shuru karein', to: '/login', guide: 'start' },
  taps: [
    { label: 'Pehle se account hai? Login', to: '/login' },
    { label: 'Pehle demo dekho (45 sec)', to: '/', guide: 'demo' },
  ],
  states: ['default'],
  guides: ['hero', 'start', 'demo'],
  tour: [
    { target: 'hero', say: 'EkBill: bill banao, WhatsApp karo, paise lo.' },
    { target: 'start', say: 'Shuru karne ke liye yahan tap karo.' },
  ],
  roles: { owner: 'The first screen for anyone not signed in.', staff: 'Same.', accountant: 'Same.' },
  reference: { harmony: '01-welcome' },
};
