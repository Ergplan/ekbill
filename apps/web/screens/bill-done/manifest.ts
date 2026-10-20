import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'bill-done',
  route: '/bills/new/done',
  title: 'Bill ban gaya',
  purpose:
    "The tick, the bill as the customer will see it (white, English), and the door: the customer's WhatsApp number (theirs on record, or typed now: their chat opens straight away, saved contact or not, with the bill's own link) and WhatsApp pe bhejo; File share karo for the PDF or photo. Another size, home, one more for the same customer. An estimate (kaccha bill) also offers Pakka bill banao.",
  primary: { label: 'WhatsApp pe bhejo', to: 'external:whatsapp', guide: 'whatsapp' },
  taps: [
    { label: 'Doosra size', to: '/bills/new/done', guide: 'size' },
    { label: 'Ghar', to: '/', guide: 'home' },
    { label: 'Isi customer ka aur ek', to: '/bills/new', guide: 'again' },
  ],
  states: ['default', 'composition'],
  guides: ['paper', 'whatsapp', 'share', 'size', 'home', 'again', 'share-file', 'pakka', 'edit'],
  // "Bill badlo" (20 Oct): the owner's, on a bill just issued.
  optionalGuides: ['share-file', 'pakka', 'edit'],
  tour: [
    { target: 'paper', say: 'Yeh bill customer ko aisa dikhega: English mein, saaf.' },
    { target: 'whatsapp', say: 'Customer ka number daalo: seedha unki WhatsApp chat khulegi. Send aap dabao.' },
    { target: 'share', say: 'PDF ya photo: jo customer ko aasaan lage.' },
  ],
  roles: { owner: 'Full.', staff: 'Full.', accountant: 'Not reachable.' },
  reference: { narangi: '04-bill-done' },
  tab: 'bills',
};
