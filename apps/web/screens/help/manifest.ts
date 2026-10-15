import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'help',
  route: '/help',
  title: 'Mera bill thoda complex hai',
  purpose:
    'The contract helper’s door: three choices (a percentage of a contract, instalments, a running bill) → the MVP’s helper flow, restyled, in Stage 9.',
  primary: { label: 'Aage chalo', to: '/help', guide: 'next' },
  taps: [{ label: 'Peeche', to: '/', guide: 'back' }],
  states: ['default'],
  guides: ['choices', 'next'],
  tour: [{ target: 'choices', say: 'Contract ka percent, kisht, ya running bill: jo aapka hai woh chuno.' }],
  roles: { owner: 'Full.', staff: 'Full.', accountant: 'Not reachable.' },
  tab: 'home',
};
