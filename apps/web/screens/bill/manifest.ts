import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'bill',
  route: '/bills/new',
  title: 'Bill',
  purpose:
    'The form. Pakka or kaccha on top (20 Oct: a bill, or an estimate the customer checks first; "Kaccha bill banao" opens it as an estimate); "Pichle jaisa hi?" when a previous bill exists; KAAM cards (Kya kiya / Kitna / Rate, Rakam computed); the GST strip for regular businesses; the CheckStrip only when a check fails; the MakeBar with the amount.',
  primary: { label: 'Bill banao', to: '/bills/new/done', guide: 'make' },
  taps: [
    { label: 'Haan, wahi bharo', to: '/bills/new', guide: 'repeat' },
    { label: 'Naya likho', to: '/bills/new', guide: 'repeat' },
    { label: 'Aur kaam jodo', to: '/bills/new', guide: 'add' },
    { label: 'badlo', to: '/bills/new', guide: 'gst' },
    { label: 'Chuno', to: '/bills/new', guide: 'checks' },
    { label: 'Kaccha (estimate)', to: '/bills/new', guide: 'kind' },
    { label: 'Peeche', to: '/', guide: 'back' },
  ],
  states: ['existing', 'new-customer', 'first', 'composition', 'check-fail'],
  guides: ['kind', 'customer', 'repeat', 'line-0', 'add', 'gst', 'gst-add', 'checks', 'total', 'make'],
  optionalGuides: ['kind', 'customer', 'checks', 'gst-add'],
  tour: [
    { target: 'kind', say: 'Pakka bill ya kaccha (estimate): yahan chuno.' },
    { target: 'repeat', say: 'Pichli baar jaisa hi? Haan dabao, sab bhar jaayega.' },
    { target: 'line-0', say: 'Kya kiya, kitna, rate. Rakam khud ban jaati hai.' },
    { target: 'gst', say: 'GST yahan: sab pe ek rate, ya har kaam ka alag.' },
    { target: 'make', say: 'Sab theek? Bill banao. Main nahi dabaungi, aap dabao.' },
  ],
  roles: { owner: 'Full.', staff: 'Full.', accountant: 'Not reachable.' },
  reference: { narangi: '03-new-bill' },
  tab: 'bills',
};
