import type { GuideStep } from '@ekbill/ui';

export type Role = 'owner' | 'staff' | 'accountant';
export type Registration = 'regular' | 'composition' | 'unregistered' | 'unknown';

/** One tap the owner can make on a screen, and where it lands (a route pattern). */
export interface Tap {
  label: string;
  to: string;
  /** The data-guide id of the element, when it has one. */
  guide?: string;
}

/**
 * What every screen declares about itself. scripts/flow-map.mjs turns the
 * manifests into docs/SCREEN-FLOW.md and the /flow screen; the tests check
 * that every tap resolves, every guide id exists and every role-hidden
 * element is absent for that role.
 */
export interface ScreenManifest {
  /** Stable id, also the folder name under apps/web/screens. */
  id: string;
  /** Route pattern as Next.js spells it: /bills/[number]. */
  route: string;
  title: string;
  purpose: string;
  /** The one primary action (I9). Omitted on read-only screens. */
  primary?: Tap;
  taps: Tap[];
  /** Fixture states the screen renders, as ?state= values; the first is the default. */
  states: string[];
  /** Every data-guide id on the screen, in tour order. */
  guides: string[];
  /** The guide tour: the spoken Hinglish per guide id (rule 17). */
  tour: GuideStep[];
  /** What each role sees, in one line each. */
  roles: Record<Role, string>;
  /** data-guide ids that must be absent for a role (8.3). */
  hidden?: Partial<Record<Role, string[]>>;
  /** Reference screen in design/screens/<theme>/, when the pack has one. */
  reference?: Partial<Record<'narangi' | 'harmony', string>>;
  /** Which tab is lit, if any. */
  tab?: 'home' | 'bills' | 'gst' | 'you';
}
