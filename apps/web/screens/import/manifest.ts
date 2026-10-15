import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'import',
  route: '/customers/import',
  title: 'Purane bills upload karo',
  purpose:
    'Pick files (PDF, photos, CSV/XLSX) → "Padh rahe hain…" → one row per customer found with a tick, "Pehle se hai" marked → add them in one tap.',
  primary: { label: 'N customers add karo', to: '/customers', guide: 'add' },
  taps: [
    { label: 'Files chuno', to: '/customers/import', guide: 'pick' },
    { label: 'Peeche', to: '/customers', guide: 'back' },
  ],
  states: ['pick', 'reading', 'rows', 'done'],
  guides: ['pick', 'files', 'reading', 'rows', 'add'],
  optionalGuides: ['pick', 'files', 'reading', 'add'],
  tour: [
    { target: 'pick', say: 'PDF, photo, CSV ya Excel: jo bhi hai, chuno.' },
    { target: 'rows', say: 'Jo mila woh yahan. Tick hatao jo nahi chahiye.' },
    { target: 'add', say: 'Ek tap mein sab jud jaate hain.' },
  ],
  roles: { owner: 'Full.', staff: 'Full.', accountant: 'Not reachable.' },
  tab: 'home',
};
