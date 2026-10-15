import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'customer',
  route: '/customers/[id]',
  title: 'Customer',
  purpose:
    'The customer’s folder: last three bills peeking, this year’s total and due, the timeline, details folded; "Inka bill banao" at the thumb.',
  primary: { label: 'Inka bill banao', to: '/bills/new', guide: 'bill' },
  taps: [
    { label: 'INV-042', to: '/bills/[number]', guide: 'timeline' },
    { label: 'Yaad dilao', to: '/bills/[number]/remind', guide: 'timeline' },
    { label: 'Details', to: '/customers/[id]', guide: 'details' },
    { label: 'Peeche', to: '/customers', guide: 'back' },
  ],
  states: ['default'],
  guides: ['folder', 'timeline', 'remind', 'details', 'bill'],
  tour: [
    { target: 'folder', say: 'Is saal kitna bill hua, kitna baaki: ek nazar mein.' },
    { target: 'timeline', say: 'Har bill yahan, naya sabse upar. WhatsApp pe gaya ya padha, dikhta hai.' },
    { target: 'bill', say: 'Inka naya bill: ek tap.' },
  ],
  roles: { owner: 'Full.', staff: 'Full.', accountant: 'Read only.' },
  hidden: { accountant: ['bill', 'remind'] },
  reference: { harmony: '03-customer' },
  tab: 'home',
};
