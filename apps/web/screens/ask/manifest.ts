import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'ask',
  route: '/poocho',
  title: 'Poocho',
  purpose: 'One question box with example chips; the answer with the records it came from; Aur poochho.',
  primary: { label: 'Poocho', to: '/poocho', guide: 'go' },
  taps: [
    { label: 'Mehta ka kitna baaki hai?', to: '/poocho', guide: 'examples' },
    { label: 'INV-042', to: '/bills/[number]', guide: 'sources' },
    { label: 'Aur poochho', to: '/poocho', guide: 'more' },
    { label: 'Peeche', to: '/', guide: 'back' },
  ],
  states: ['empty', 'answered'],
  guides: ['question', 'examples', 'go', 'answer', 'sources', 'more'],
  tour: [
    { target: 'question', say: 'Apne bills ke baare mein kuch bhi poocho.' },
    { target: 'sources', say: 'Jawab ke saath woh bills jinse pata chala.' },
  ],
  roles: { owner: 'Full.', staff: 'Full.', accountant: 'Full.' },
  tab: 'home',
};
