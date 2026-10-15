import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'credit-note',
  route: '/bills/[number]/credit-note',
  title: 'Rakam kam karo',
  purpose:
    'Reduce a sent bill without touching it: an amount and a one-line reason make a credit note with its own number, linked to the bill.',
  primary: { label: 'Credit note banao', to: '/bills/[number]', guide: 'make' },
  taps: [{ label: 'Peeche', to: '/bills/[number]', guide: 'back' }],
  states: ['default', 'done'],
  guides: ['amount', 'reason', 'make'],
  tour: [
    { target: 'amount', say: 'Kitna kam karna hai?' },
    { target: 'reason', say: 'Ek line mein kyun. CA ko kaam aayega.' },
    { target: 'make', say: 'Credit note ban jaayega, apne number ke saath.' },
  ],
  roles: { owner: 'Full.', staff: 'Not reachable.', accountant: 'Not reachable.' },
  tab: 'bills',
};
