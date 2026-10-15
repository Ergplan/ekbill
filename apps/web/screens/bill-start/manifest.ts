import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'bill-start',
  route: '/bills/new',
  title: 'Kiska bill?',
  purpose:
    'Reached when a bill is started without a customer (the Bills tab, the mic): every customer by recency, search, Naya customer.',
  primary: { label: 'Mehta Traders', to: '/bills/new', guide: 'pick' },
  taps: [
    { label: 'Naya customer', to: '/customers/new', guide: 'new' },
    { label: 'Peeche', to: '/', guide: 'back' },
  ],
  states: ['default'],
  guides: ['search', 'pick', 'new'],
  tour: [
    { target: 'pick', say: 'Kiska bill? Naam pe tap karo.' },
    { target: 'new', say: 'Naya customer ho to yahan se jodo.' },
  ],
  roles: { owner: 'Full.', staff: 'Full.', accountant: 'Not reachable (cannot make bills).' },
  tab: 'bills',
};
