import { memberships } from '@ekbill/db';

import { FIXTURE } from '../fixtures';
import { scopeOf } from '../live';
import type { Viewer } from '../viewer';

export interface TeamMember {
  id: string;
  name: string;
  phone: string;
  role: 'owner' | 'staff' | 'accountant';
  status: 'active' | 'invited';
  you: boolean;
}

/** The members of the viewer's business (the owner only reaches the screen); Stage 9: the memberships. */
export async function loadTeam(viewer: Viewer): Promise<{ members: TeamMember[]; live: boolean }> {
  const b = viewer.business;
  if (!b) return { members: [], live: false };
  const scope = scopeOf(viewer);
  if (!scope)
    return {
      live: false,
      members: FIXTURE.people
        .filter((p) => p.business === b.id)
        .map((p) => ({
          id: p.id,
          name: p.name,
          phone: p.phone,
          role: p.role,
          status: 'active',
          you: p.id === viewer.person.id,
        })),
    };
  const rows = await memberships.listMembers(scope);
  return {
    live: true,
    members: rows
      .filter((m) => m.status !== 'removed')
      .map((m) => ({
        id: m.userId,
        name: m.name,
        phone: m.phoneE164,
        role: m.role,
        status: m.status === 'invited' ? 'invited' : 'active',
        you: m.userId === scope.userId,
      })),
  };
}
