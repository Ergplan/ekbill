import { plan, type BusinessProfile, type Series } from '@ekbill/db';
import { PLAN, formatDateShort, todayIst } from '@ekbill/engine';

import { FIXTURE, type Business } from '../fixtures';
import { scopeOf } from '../live';
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
  /** The plan row's words (20 Oct): a dictionary key and its values. */
  plan?: { key: string; params: Record<string, string | number> };
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

/** The plan row on Aap (20 Oct): free bills left, the month's end, the fee due, or free. */
export async function planSummaryOf(viewer: Viewer): Promise<AapData['plan']> {
  const scope = scopeOf(viewer);
  if (!scope) return { key: 'aap.plan.free', params: { left: 13 } };
  const { state } = await plan.planOf(scope, todayIst(new Date()));
  if (state.kind === 'free') return { key: 'aap.plan.free', params: { left: state.freeLeft } };
  if (state.kind === 'paid') return { key: 'aap.plan.paid', params: { date: formatDateShort(state.until) } };
  if (state.kind === 'comp') return { key: 'aap.plan.comp', params: {} };
  return { key: 'aap.plan.due', params: { fee: PLAN.monthlyPaise / 100 } };
}
