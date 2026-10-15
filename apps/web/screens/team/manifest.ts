import type { ScreenManifest } from '../types';

export const manifest: ScreenManifest = {
  id: 'team',
  route: '/aap/team',
  title: 'Team',
  purpose:
    'Members with role pills; Invite karo (phone, role, Bhejo: the invite is a WhatsApp message with the link); per member: change role, Hatao.',
  primary: { label: 'Bhejo', to: 'external:whatsapp', guide: 'send' },
  taps: [
    { label: 'Invite karo', to: '/aap/team', guide: 'invite' },
    { label: 'Role badlo', to: '/aap/team', guide: 'members' },
    { label: 'Hatao', to: '/aap/team', guide: 'members' },
    { label: 'Peeche', to: '/aap', guide: 'back' },
  ],
  states: ['default'],
  guides: ['members', 'invite', 'send'],
  optionalGuides: ['send'],
  tour: [
    { target: 'members', say: 'Kaun kya kar sakta hai: malik sab, staff bills, CA sirf dekhna.' },
    { target: 'invite', say: 'Phone number aur role; invite WhatsApp pe jaata hai.' },
  ],
  roles: { owner: 'Full.', staff: 'Not reachable.', accountant: 'Not reachable.' },
  tab: 'you',
};
