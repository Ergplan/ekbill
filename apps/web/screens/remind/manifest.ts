import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'remind',
  route: '/bills/[number]/remind',
  title: 'Yaad dilao',
  purpose:
    'Pick the tone, see the message as it will arrive in the customer’s language with the bill attached, open WhatsApp.',
  primary: { label: 'WhatsApp kholo', to: 'external:whatsapp', guide: 'open' },
  taps: [
    { label: 'Pyaar se', to: '/bills/[number]/remind', guide: 'tone' },
    { label: 'Bhasha badlo', to: '/bills/[number]/remind', guide: 'lang' },
    { label: 'Peeche', to: '/bills/[number]', guide: 'back' },
  ],
  states: ['default', 'english'],
  guides: ['tone', 'preview', 'lang', 'open'],
  tour: [
    { target: 'tone', say: 'Pyaar se, seedha, ya doosri baar: lehja chuno.' },
    { target: 'preview', say: 'Message aisa jaayega, bill ke saath.' },
    { target: 'open', say: 'WhatsApp kholo. Bhejna aap dabao.' },
  ],
  roles: { owner: 'Full.', staff: 'Full.', accountant: 'Not reachable.' },
  reference: { narangi: '05-remind', harmony: '05-remind' },
  tab: 'home',
};
