import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'customer-new',
  route: '/customers/new',
  title: 'Naya customer',
  purpose:
    'Name first; phone and GSTIN folded under it (state and PAN derived from the GSTIN); their language. "Customer jodo" lands on their bill.',
  primary: { label: 'Customer jodo', to: '/bills/new', guide: 'add' },
  taps: [{ label: 'Peeche', to: '/customers', guide: 'back' }],
  states: ['default', 'edit'],
  guides: ['name', 'more', 'add'],
  tour: [
    { target: 'name', say: 'Bas naam kaafi hai. Phone aur GSTIN baad mein bhi.' },
    { target: 'add', say: 'Customer jodo: seedha unke bill pe pahunchoge.' },
  ],
  roles: { owner: 'Full.', staff: 'Full.', accountant: 'Not reachable.' },
  tab: 'home',
};
