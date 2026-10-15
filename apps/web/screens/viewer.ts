import 'server-only';

import { cookies } from 'next/headers';

import { FIXTURE, type Business, type Person } from './fixtures';
import type { Role } from './types';

/**
 * Who is looking. In the prototype: the person picked on /dev/switch (cookie
 * eb-as), overridden for one view by ?as=owner|staff|accountant|new|composition
 * (the role views the Stage 1 prompt asks for). Stage 2 replaces this with the
 * session and the membership; the shape stays.
 */
export interface Viewer {
  person: Person;
  business: Business | null;
  role: Role;
  /** The prototype's switch, for links that must keep the role view. */
  as: string | null;
}

const AS_TO_PERSON: Record<string, string> = {
  owner: 'sharma',
  staff: 'ravi',
  accountant: 'meera',
  new: 'new',
  composition: 'gupta',
};

export type SearchParams = Record<string, string | string[] | undefined>;

export function one(v: string | string[] | undefined): string | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export async function getViewer(searchParams?: SearchParams): Promise<Viewer> {
  const as = one(searchParams?.as);
  const jar = await cookies();
  const personId = (as && AS_TO_PERSON[as]) || jar.get('eb-as')?.value || 'sharma';
  const person = FIXTURE.people.find((p) => p.id === personId) ?? FIXTURE.people[0]!;
  const business = person.business ? (FIXTURE.businesses.find((b) => b.id === person.business) ?? null) : null;
  return { person, business, role: person.role, as };
}

/** Keep ?as= on an internal link while a role view is being looked at. */
export function withAs(href: string, as: string | null): string {
  if (!as) return href;
  return `${href}${href.includes('?') ? '&' : '?'}as=${as}`;
}

/** The serialisable part of the viewer for the client shell. */
export function shellOf(v: Viewer) {
  return {
    personId: v.person.id,
    personName: v.person.name,
    businessName: v.business?.name ?? null,
    registration: v.business?.registration ?? null,
    role: v.role,
    as: v.as,
  };
}
