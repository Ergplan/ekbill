import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'bill-done',
  route: '/bills/new/done',
  title: 'Bill ban gaya',
  purpose:
    'The tick, the bill as the customer will see it (white, English), and the door: WhatsApp pe bhejo. PDF or Photo, another size, home, one more for the same customer.',
  primary: { label: 'WhatsApp pe bhejo', to: 'external:whatsapp', guide: 'whatsapp' },
  taps: [
    { label: 'Doosra size', to: '/bills/new/done', guide: 'size' },
    { label: 'Ghar', to: '/', guide: 'home' },
    { label: 'Isi customer ka aur ek', to: '/bills/new', guide: 'again' },
  ],
  states: ['default', 'composition'],
  guides: ['paper', 'whatsapp', 'share', 'size', 'home', 'again'],
  tour: [
    { target: 'paper', say: 'Yeh bill customer ko aisa dikhega: English mein, saaf.' },
    { target: 'whatsapp', say: 'WhatsApp pe bhejo. Yeh aap dabao, main nahi.' },
    { target: 'share', say: 'PDF ya photo: jo customer ko aasaan lage.' },
  ],
  roles: { owner: 'Full.', staff: 'Full.', accountant: 'Not reachable.' },
  reference: { narangi: '04-bill-done' },
  tab: 'bills',
};
