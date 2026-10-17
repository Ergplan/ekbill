import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'photo',
  route: '/bills/photo',
  title: 'Photo se bill',
  purpose:
    'Camera or gallery → "Padh rahe hain…" → the photo on top and the draft below, each field coloured by how sure the reading was; tap to fix; Bill banao. Three error states: unclear, no bill found, and the reader unavailable.',
  primary: { label: 'Bill banao', to: '/bills/new/done', guide: 'make' },
  taps: [
    { label: 'Photo lo', to: '/bills/photo', guide: 'camera' },
    { label: 'Gallery se', to: '/bills/photo', guide: 'gallery' },
    { label: 'Dobara lo', to: '/bills/photo', guide: 'retake' },
    { label: 'Naya bill likho', to: '/bills/new', guide: 'write' },
    { label: 'Peeche', to: '/', guide: 'back' },
  ],
  states: ['pick', 'reading', 'review', 'unclear', 'notfound', 'unavailable'],
  guides: ['camera', 'gallery', 'reading', 'photo', 'fields', 'make', 'retake', 'write'],
  optionalGuides: ['camera', 'gallery', 'reading', 'retake', 'write'],
  tour: [
    { target: 'photo', say: 'Yeh aapki photo. Neeche jo padha, woh.' },
    { target: 'fields', say: 'Halka rang pakka hai; gehra rang ek baar dekh lo. Tap karke sudharo.' },
    { target: 'make', say: 'Sab sahi? Bill banao. Bina aapke tap ke kuch nahi banta.' },
  ],
  roles: { owner: 'Full.', staff: 'Full.', accountant: 'Not reachable.' },
  tab: 'home',
};
