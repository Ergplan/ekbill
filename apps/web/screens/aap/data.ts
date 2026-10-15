import type { BusinessProfile, Series } from '@ekbill/db';

import { FIXTURE, type Business } from '../fixtures';
import type { Viewer } from '../viewer';

/** The series as the Aap screen edits them (no dates: the row is what the owner sees). */
export interface SeriesRow {
  id: string;
  name: string;
  kind: 'bill' | 'credit_note';
  prefix: string;
  padding: number;
  includeFy: boolean;
  nextNumber: number;
  fy: string | null;
  active: boolean;
  isDefault: boolean;
}

export interface AapData {
  business: Business;
  /** The editable profile (Stage 4); null for a fixture look (?as=), which stays read-only. */
  profile: BusinessProfile | null;
  series: SeriesRow[];
  logoUrl: string | null;
  signatureUrl: string | null;
  team: number;
  build: string;
}

const rowOf = (s: Series, defaultId: string | null): SeriesRow => ({
  id: s.id,
  name: s.name,
  kind: s.kind,
  prefix: s.prefix,
  padding: s.padding,
  includeFy: s.includeFy,
  nextNumber: s.nextNumber,
  fy: s.fy,
  active: s.active,
  isDefault: s.id === defaultId,
});

export function loadAap(viewer: Viewer, build: string): AapData | null {
  const b = viewer.business;
  if (!b) return null;
  const loaded = viewer.loaded;
  if (!loaded) {
    return {
      business: b,
      profile: null,
      series: [],
      logoUrl: null,
      signatureUrl: null,
      team: FIXTURE.people.filter((p) => p.business === b.id).length,
      build,
    };
  }
  return {
    business: b,
    profile: loaded.profile,
    series: loaded.series.map((s) => rowOf(s, loaded.profile.defaultSeriesId)),
    logoUrl: loaded.logoUrl,
    signatureUrl: loaded.signatureUrl,
    team: loaded.team,
    build,
  };
}
