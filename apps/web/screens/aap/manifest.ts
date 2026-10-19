import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'aap',
  route: '/aap',
  title: 'Aap',
  purpose:
    'Everything about the person, the business and the app, in groups: aapki profile (their own name), dukaan, paise kaise dein, series, bill kaisa dikhe, theme, language, Bolke, team, app ki jaankari. One sticky Save.',
  primary: { label: 'Save karo', to: '/aap', guide: 'save' },
  taps: [
    { label: 'Team', to: '/aap/team', guide: 'team' },
    { label: 'Kaam / Saamaan', to: '/items', guide: 'items' },
    { label: 'Sample dekho', to: '/bills/new/done', guide: 'look' },
    { label: 'Bill number series', to: '/aap', guide: 'series' },
    { label: 'Poocho', to: '/poocho', guide: 'ask' },
    { label: 'Mera bill thoda complex hai', to: '/help', guide: 'ask' },
  ],
  states: ['owner', 'staff', 'accountant', 'composition'],
  // Save floats only while something is unsaved (19 Oct).
  optionalGuides: ['save'],
  guides: [
    'person',
    'dukaan',
    'paise',
    'series',
    'look',
    'logo',
    'theme',
    'lang',
    'voice',
    'team',
    'items',
    'ask',
    'about',
    'save',
  ],
  tour: [
    { target: 'person', say: 'Aapki profile: aapka naam. Ghar pe isi naam se namaste karenge.' },
    { target: 'dukaan', say: 'Dukaan ka naam, PAN, GST: yeh sab bill pe chhapta hai.' },
    { target: 'look', say: 'Logo, signature, design, paper: bill kaisa dikhe.' },
    {
      target: 'voice',
      say: 'Bolke: chalu ho to mic ke paas ek ishaara dikhega. Awaaz tab hi shuru hoti hai jab aap mic dabao.',
    },
    { target: 'save', say: 'Kuch badla? Save karo.' },
  ],
  roles: {
    owner: 'Everything.',
    staff: 'Theme, language, Bolke, app info; business settings read only.',
    accountant: 'Same as staff.',
  },
  hidden: { staff: ['team', 'save'], accountant: ['team', 'save', 'items'] },
  reference: { narangi: '07-profile' },
  tab: 'you',
};
