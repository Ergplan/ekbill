import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'home',
  route: '/',
  title: 'Ghar',
  purpose:
    'Three questions and nothing else: Kiska bill? Bheje hue bills. Kiske paise aane hain. The mic is the centre of the tab bar.',
  primary: { label: 'Mehta Traders', to: '/bills/new', guide: 'kiska-bill' },
  taps: [
    { label: 'Naya customer', to: '/customers/new', guide: 'naya-customer' },
    { label: 'Photo se bill', to: '/bills/photo', guide: 'photo' },
    { label: 'Naam dhoondo', to: '/customers', guide: 'search' },
    { label: 'Saare bills dekho', to: '/bills', guide: 'sent' },
    { label: 'Yaad dilao', to: '/bills/[number]/remind', guide: 'paise' },
    { label: 'Sab dekho', to: '/dues', guide: 'paise' },
    { label: 'Pehla bill banao', to: '/bills/new', guide: 'first' },
    { label: 'Bills', to: '/bills' },
    { label: 'GST', to: '/gst' },
    { label: 'Aap', to: '/aap' },
  ],
  states: ['owner', 'staff', 'accountant', 'new', 'composition'],
  guides: ['kiska-bill', 'naya-customer', 'photo', 'search', 'sent', 'paise', 'mic', 'first'],
  tour: [
    { target: 'kiska-bill', say: 'Kiska bill banana hai? Naam pe tap karo.' },
    { target: 'photo', say: 'Kaccha bill hai? Photo lo, hum padh lenge.' },
    { target: 'sent', say: 'Is mahine ke bheje hue bills yahan.' },
    { target: 'paise', say: 'Kiske paise aane hain: sabse purana sabse upar. Yaad dilao ek tap.' },
    { target: 'mic', say: 'Bolke bhi kar sakte ho. Main jo bolungi, wahi jagah chamkegi.' },
  ],
  roles: {
    owner: 'All three cards.',
    staff: 'All three cards, with a note that they bill for the business.',
    accountant: 'Bheje hue bills and Kiske paise aane hain only; no Yaad dilao.',
  },
  hidden: { accountant: ['kiska-bill', 'naya-customer', 'photo', 'search', 'remind'] },
  reference: { narangi: '02-home', harmony: '02-home' },
  tab: 'home',
};
