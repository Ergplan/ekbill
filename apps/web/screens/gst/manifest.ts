import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'gst',
  route: '/gst',
  title: 'GST',
  purpose:
    'Regular businesses only: the period, two tiles (Bills, GST), the rate split, the B2B list, the B2C note, drill-down on any figure, and CA ko bhejo with the zip.',
  primary: { label: 'CA ko bhejo', to: 'external:share', guide: 'send' },
  taps: [
    { label: 'Mahina', to: '/gst', guide: 'period' },
    { label: 'INV-042', to: '/bills/[number]', guide: 'b2b' },
    { label: 'Bills', to: '/bills', guide: 'tiles' },
  ],
  states: ['default', 'month'],
  guides: ['period', 'tiles', 'rates', 'b2b', 'send'],
  tour: [
    { target: 'tiles', say: 'Is quarter kitne bills, kitna GST.' },
    { target: 'rates', say: 'Rate ke hisaab se: CGST aur SGST alag.' },
    { target: 'send', say: 'CA ko bhejo: Excel, saare PDF aur GSTR-1 ki file ek zip mein.' },
  ],
  roles: {
    owner: 'Full.',
    staff: 'See the workings; no CA pack.',
    accountant: 'See the workings and export the CA pack.',
  },
  hidden: { staff: ['send'] },
  reference: { narangi: '06-gst' },
  tab: 'gst',
};
