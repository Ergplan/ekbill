import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'bill-view',
  route: '/bills/[number]',
  title: 'Bill',
  purpose:
    'One sent bill: what is due, large; Paise aa gaye (Poore / Kuch hissa); Yaad dilao; WhatsApp dobara; Download; and, folded, "Galti ho gayi?" with cancel-and-redo and the credit note.',
  primary: { label: 'Paise aa gaye', to: '/bills/[number]', guide: 'paid' },
  taps: [
    { label: 'Poore', to: '/bills/[number]', guide: 'paid-sheet' },
    { label: 'Kuch hissa', to: '/bills/[number]', guide: 'paid-sheet' },
    { label: 'Yaad dilao', to: '/bills/[number]/remind', guide: 'remind' },
    { label: 'WhatsApp dobara', to: 'external:whatsapp', guide: 'wa' },
    { label: 'Download', to: 'external:pdf', guide: 'download' },
    { label: 'Cancel karke naya banao', to: '/bills/new', guide: 'mistake' },
    { label: 'Rakam kam karo', to: '/bills/[number]/credit-note', guide: 'mistake' },
    { label: 'Peeche', to: '/bills', guide: 'back' },
  ],
  states: ['due', 'partial', 'paid', 'cancelled', 'credit-note'],
  guides: ['amount', 'paid', 'remind', 'wa', 'download', 'paper', 'mistake', 'paid-sheet'],
  optionalGuides: ['paid-sheet'],
  tour: [
    { target: 'amount', say: 'Itna baaki hai is bill pe.' },
    { target: 'paid', say: 'Paise aa gaye? Yahan likh lo: poore, ya kuch hissa.' },
    { target: 'remind', say: 'Yaad dilana ho to ek tap.' },
    { target: 'mistake', say: 'Galti ho gayi? Cancel karke naya banao, ya rakam kam karo.' },
  ],
  roles: {
    owner: 'Everything.',
    staff: 'No cancel, no credit note.',
    accountant: 'Read, download. No money, no reminder.',
  },
  hidden: { staff: ['mistake'], accountant: ['paid', 'remind', 'wa', 'mistake'] },
  tab: 'bills',
};
