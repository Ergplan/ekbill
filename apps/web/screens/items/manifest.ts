import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'items',
  route: '/items',
  title: 'Items',
  purpose:
    'Kaam and saamaan the business bills for, with HSN/SAC, unit, rate and GST rate; reached from Aap and from the form’s suggestions.',
  primary: { label: 'Naya item', to: '/items/[id]', guide: 'new' },
  taps: [
    { label: 'AMC visit', to: '/items/[id]', guide: 'list' },
    { label: 'Peeche', to: '/aap', guide: 'back' },
  ],
  states: ['default'],
  guides: ['search', 'list', 'new'],
  tour: [
    { target: 'list', say: 'Jo baar-baar bill karte ho, woh yahan. Rate aur GST yaad rehta hai.' },
    { target: 'new', say: 'Naya item jodo, ya bill banate waqt khud jud jaayega.' },
  ],
  roles: { owner: 'Full.', staff: 'Full.', accountant: 'Read only.' },
  hidden: { accountant: ['new'] },
  tab: 'you',
};
