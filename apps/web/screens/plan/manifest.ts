import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'plan',
  route: '/aap/plan',
  title: 'Aapka plan',
  purpose:
    'EkBill’s own fee (20 Oct): how many of the 20 free bills are left, or how long the paid month runs; pay ₹20 by UPI (₹15 with a referral) and give the 12-digit reference; the referral link (WhatsApp, copy) with who joined and billed; past payments.',
  primary: { label: 'UPI se ₹20 do', to: 'external:upi', guide: 'pay' },
  taps: [
    { label: 'Payment ho gaya', to: '/aap/plan', guide: 'utr' },
    { label: 'WhatsApp pe bhejo', to: 'external:whatsapp', guide: 'refer' },
    { label: 'Link copy karo', to: '/aap/plan', guide: 'refer' },
    { label: 'Peeche', to: '/aap', guide: 'back' },
  ],
  states: ['default'],
  guides: ['status', 'pay', 'refer', 'utr'],
  optionalGuides: ['utr', 'refer'],
  tour: [
    { target: 'status', say: 'Kitne bill muft bache, ya mahina kab tak chalu.' },
    { target: 'pay', say: 'UPI se ₹20 do, phir 12 ank ka reference daalo.' },
    { target: 'refer', say: 'Yeh link dost ko bhejo: har dost se ek mahina 25% sasta.' },
  ],
  roles: {
    owner: 'Full: pays and shares the link.',
    staff: 'Sees the plan and shares the link; payment is the owner’s.',
    accountant: 'Sees the plan only.',
  },
  tab: 'you',
};
