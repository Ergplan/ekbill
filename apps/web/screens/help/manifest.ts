import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'help',
  route: '/help',
  title: 'Mera bill thoda complex hai',
  purpose:
    'The contract helper: three choices (a percentage of a contract, instalments, a running bill), then the contract’s terms (typed or pasted) and the working for this one bill; "Is hisaab se bill banao" opens the bill form with the line.',
  primary: { label: 'Aage chalo', to: '/help', guide: 'next' },
  taps: [
    { label: 'Peeche', to: '/', guide: 'back' },
    { label: 'Is hisaab se bill banao', to: '/bills/new', guide: 'make' },
  ],
  states: ['default', 'terms'],
  guides: ['choices', 'next', 'paste', 'terms', 'milestones', 'which', 'progress', 'plan', 'make'],
  optionalGuides: ['paste', 'terms', 'milestones', 'which', 'progress', 'plan', 'make'],
  tour: [
    { target: 'choices', say: 'Contract ka percent, kisht, ya running bill: jo aapka hai woh chuno.' },
    { target: 'paste', say: 'Contract ka text ho to yahan daalo, hum bhar denge.' },
    { target: 'plan', say: 'Is bill ka poora hisaab yahan.' },
  ],
  roles: { owner: 'Full.', staff: 'Full.', accountant: 'Not reachable.' },
  tab: 'home',
};
