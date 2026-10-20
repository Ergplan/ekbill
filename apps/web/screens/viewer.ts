import type { Locale } from '@ekbill/copy';
import 'server-only';

import { DEMO_VERSION, isOwnName, seedBusinessById, seedUserById, type Resolved } from '@ekbill/db';

import { redirect } from 'next/navigation';

import { current } from '../server/session';
import { loadBusiness, type LoadedBusiness } from './business';
import { FIXTURE, type Business, type Person } from './fixtures';
import type { Role } from './types';

/**
 * Who is looking (Stage 2): the session's user, business and role, resolved
 * once per request by apps/web/server/session.ts. The product screens still
 * render the Stage 1 fixtures (Stages 4–9 re-point their loaders), so the
 * viewer also carries the fixture persona the seeded person maps to: the
 * seed's keys are the fixture's ids. A seeded business the fixtures do not
 * know (Verma Traders) shows its people the first-run flow until Stage 4.
 * `?as=owner|staff|accountant|new|composition` still overrides one view for
 * the /flow review screen (a look, not an identity: the session stays).
 */
export interface Viewer {
  person: Person;
  business: Business | null;
  role: Role;
  /** The prototype's switch, for links that must keep the role view. */
  as: string | null;
  /** The real identity behind the view, when there is a session. */
  session: Resolved | null;
  theme: 'narangi' | 'harmony' | 'system';
  language: Locale;
  /** The real business behind the view (Stage 4): its profile, series and files; null for a look or no business. */
  loaded: LoadedBusiness | null;
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

function fixturePerson(id: string): Person | null {
  return FIXTURE.people.find((p) => p.id === id) ?? null;
}

export async function getViewer(searchParams?: SearchParams): Promise<Viewer> {
  const as = one(searchParams?.as);
  const session = await current();
  if (as && AS_TO_PERSON[as]) {
    const person = fixturePerson(AS_TO_PERSON[as]!) ?? FIXTURE.people[0]!;
    const business = person.business ? (FIXTURE.businesses.find((b) => b.id === person.business) ?? null) : null;
    return {
      person,
      business,
      role: person.role,
      as,
      session,
      theme: session?.user.theme ?? 'narangi',
      language: session?.user.language ?? 'hi-Latn',
      loaded: null,
    };
  }
  // No session: the welcome screen (sign-in, the demo), never the sample shop dressed as one's own (20 Oct, the
  // operator on the VM: the sample's Aap, language, voice and bills looked broken because nothing could be saved).
  // The sample stays reachable as what it is: a look (?as=), as the demo and /flow use it.
  if (!session) redirect('/welcome');
  const seedUser = seedUserById(session.user.id);
  const seedBusiness = session.business ? seedBusinessById(session.business.id) : null;
  const role: Role = session.role ?? 'owner';
  const known = seedUser ? fixturePerson(seedUser.key) : null;
  // The business is real (Stage 4): its profile from the repository, shaped like the fixture so the screens
  // that still read fixture bills and customers (Stages 5–9) find them by the seed key.
  const loaded = session.scope
    ? await loadBusiness(session.scope, {
        theme: session.user.theme,
        lang: session.user.language,
        fixtureKey: seedBusiness?.key ?? null,
      })
    : null;
  const business = loaded?.view ?? null;
  const person: Person = known ?? {
    id: seedUser?.key ?? session.user.id,
    name: session.user.name,
    role,
    business: business?.id ?? null,
    phone: session.user.phoneE164,
  };
  return {
    person: { ...person, name: session.user.name, role, business: business?.id ?? null },
    business,
    role,
    as: null,
    session,
    theme: session.user.theme,
    language: session.user.language,
    loaded,
  };
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
    // The person has said their name (a new sign-in is "Naya user", an invite "Naya member", until they do).
    named: isOwnName(v.person.name),
    // The app demo (20 Oct): the version this person has seen (a look or no session counts as seen), and the current.
    demoSeen: v.session && !v.as ? v.session.user.demoSeenVersion : DEMO_VERSION,
    demoVersion: DEMO_VERSION,
    businessName: v.business?.name ?? v.session?.business?.tradeName ?? null,
    registration: v.business?.registration ?? null,
    role: v.role,
    as: v.as,
    language: v.language,
    // "Bolke" (Aap): a hint by the mic once a visit; the voice itself starts only on a tap (19 Oct).
    voice: v.business?.voiceOnArrival ?? false,
    // A signed-in member (not a look, not the demo): the voice can be minted for them.
    signedIn: Boolean(v.session?.scope) && !v.as,
    // Anyone signed in, a business or not yet (setup), and not a look: the mic is the voice's; else the tour's (20 Oct).
    canTalk: Boolean(v.session) && !v.as,
  };
}
