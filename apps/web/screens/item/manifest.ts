import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'item',
  route: '/items/[id]',
  title: 'Item',
  purpose: 'One item: name, HSN/SAC with a lookup, unit, rate, GST rate. Save.',
  primary: { label: 'Save karo', to: '/items', guide: 'save' },
  taps: [
    { label: 'Dhoondo', to: '/items/[id]', guide: 'hsn' },
    { label: 'Peeche', to: '/items', guide: 'back' },
  ],
  states: ['default', 'new'],
  guides: ['name', 'hsn', 'rate', 'save'],
  tour: [
    { target: 'hsn', say: 'HSN ya SAC: naam likho, hum dhoondh denge. GST ka rate isi se tay hota hai.' },
    { target: 'save', say: 'Save karo; agle bill mein suggestion mein aayega.' },
  ],
  roles: { owner: 'Full.', staff: 'Full.', accountant: 'Read only.' },
  hidden: { accountant: ['save'] },
  tab: 'you',
};
