import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'bills',
  route: '/bills',
  title: 'Bills',
  purpose:
    'Every bill, newest first. Filter by state, by series when there is more than one, and search by name or number. Kaccha (20 Oct): the estimates, apart from the bills, each with the pakka bill made from it.',
  taps: [
    { label: 'INV-044', to: '/bills/[number]', guide: 'list' },
    { label: 'Sab', to: '/bills', guide: 'filters' },
    { label: 'Baaki', to: '/bills', guide: 'filters' },
    { label: 'Aa gaye', to: '/bills', guide: 'filters' },
    { label: 'Cancel', to: '/bills', guide: 'filters' },
    { label: 'Kaccha (estimate)', to: '/bills', guide: 'filters' },
  ],
  states: ['default'],
  guides: ['search', 'filters', 'series', 'list'],
  tour: [
    { target: 'filters', say: 'Sab, Baaki, Aa gaye, Cancel, Kaccha: ek tap mein chhaant lo.' },
    { target: 'search', say: 'Naam ya bill number likho.' },
    { target: 'list', say: 'Kisi bill pe tap karo: paise aa gaye, yaad dilao, sab wahin.' },
  ],
  roles: { owner: 'Full list.', staff: 'Full list.', accountant: 'Full list, read only.' },
  tab: 'bills',
};
