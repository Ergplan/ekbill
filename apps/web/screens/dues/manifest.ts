import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'dues',
  route: '/dues',
  title: 'Kiske paise aane hain',
  purpose: 'The full list of unpaid bills, oldest first, with age and amount; remind or record money on each row.',
  primary: { label: 'Yaad dilao', to: '/bills/[number]/remind', guide: 'rows' },
  taps: [
    { label: 'Paise aa gaye', to: '/bills/[number]', guide: 'rows' },
    { label: 'Peeche', to: '/', guide: 'back' },
  ],
  states: ['default', 'empty'],
  guides: ['total', 'rows'],
  tour: [
    { target: 'total', say: 'Kul itne paise aane hain.' },
    { target: 'rows', say: 'Sabse purana sabse upar. Yaad dilao, ya paise aa gaye ho to woh batao.' },
  ],
  roles: { owner: 'Remind and record on each row.', staff: 'Same.', accountant: 'List only.' },
  hidden: { accountant: ['remind', 'paid'] },
  tab: 'home',
};
