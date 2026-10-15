import { FIXTURE } from '../fixtures';
import type { Role } from '../types';

export interface SwitchRow {
  id: string;
  name: string;
  business: string | null;
  role: Role;
  index: number;
}

export function loadSwitch(): SwitchRow[] {
  return FIXTURE.people.map((p, index) => ({
    id: p.id,
    name: p.name,
    business: p.business ? (FIXTURE.businesses.find((b) => b.id === p.business)?.name ?? null) : null,
    role: p.role,
    index,
  }));
}
