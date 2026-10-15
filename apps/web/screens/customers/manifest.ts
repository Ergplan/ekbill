import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'customers',
  route: '/customers',
  title: 'Customers',
  purpose: 'The directory, by recency, with search, Naya customer and the way in to Purane bills upload karo.',
  primary: { label: 'Naya customer', to: '/customers/new', guide: 'new' },
  taps: [
    { label: 'Mehta Traders', to: '/customers/[id]', guide: 'list' },
    { label: 'Purane bills upload karo', to: '/customers/import', guide: 'import' },
    { label: 'Peeche', to: '/', guide: 'back' },
  ],
  states: ['default'],
  guides: ['search', 'list', 'new', 'import'],
  tour: [
    { target: 'search', say: 'Naam, phone ya GSTIN se dhoondo.' },
    { target: 'list', say: 'Naam pe tap karo: unka folder khulta hai.' },
    { target: 'import', say: 'Purane bills ya Excel hai? Upload karo, customers khud ban jaayenge.' },
  ],
  roles: { owner: 'Full.', staff: 'Full.', accountant: 'Read only, no add.' },
  hidden: { accountant: ['new', 'import'] },
  tab: 'home',
};
