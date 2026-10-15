import { SEED, membershipsOf } from '@ekbill/db';

import type { Role } from '../types';

export interface SwitchRow {
  /** The seed key, also the /dev/switch/<key> path. */
  id: string;
  name: string;
  business: string | null;
  role: Role | null;
  index: number;
}

/** The seeded people with their business and role, from the database (the seed must have run). */
export async function loadSwitch(): Promise<SwitchRow[]> {
  const rows: SwitchRow[] = [];
  let index = 0;
  for (const u of SEED.users) {
    const m = (await membershipsOf(u.id))[0] ?? null;
    rows.push({ id: u.key, name: u.name, business: m?.tradeName ?? null, role: m?.role ?? null, index });
    index += 1;
  }
  return rows;
}
