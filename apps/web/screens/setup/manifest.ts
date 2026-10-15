import type { ScreenManifest } from '../types';

export const SETUP_STEPS = ['name', 'gst', 'gstin', 'turnover', 'irn', 'review', 'pan', 'upi', 'city', 'sign'] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

export const manifest: ScreenManifest = {
  id: 'setup',
  route: '/setup/[step]',
  title: 'Setup',
  purpose:
    'First time: one question per screen. Name, GST status, then only what that answer needs (GSTIN, turnover, IRN). "Sab sahi hai?" starts the app; UPI, city, signature and PAN are offered there and can wait for Aap.',
  primary: { label: 'Chalo, shuru karte hain', to: '/', guide: 'go' },
  taps: [
    { label: 'Aage', to: '/setup/[step]', guide: 'next' },
    { label: 'Abhi nahi', to: '/setup/[step]', guide: 'skip' },
    { label: 'Abhi bhar deta hoon', to: '/setup/[step]', guide: 'more' },
    { label: 'Badlo', to: '/setup/[step]' },
    { label: 'Peeche', to: '/setup/[step]', guide: 'back' },
  ],
  states: [...SETUP_STEPS],
  guides: ['hello', 'answer', 'next', 'skip', 'go', 'more'],
  tour: [
    { target: 'hello', say: 'Namaste ji! Hum pehli baar mil rahe hain, to apne baare mein thoda bataiye.' },
    { target: 'answer', say: 'Yahan jawab likho ya chuno. Ek baar mein ek hi sawaal.' },
    { target: 'next', say: 'Aage dabao. Galti ho to peeche aa sakte ho.' },
  ],
  roles: {
    owner: 'Only an owner sets up a business.',
    staff: 'Not reached: staff are invited into a business.',
    accountant: 'Same as staff.',
  },
};
