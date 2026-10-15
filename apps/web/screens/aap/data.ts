import { FIXTURE, type Business } from '../fixtures';
import type { Viewer } from '../viewer';

export interface AapData {
  business: Business;
  team: number;
  build: string;
}

export function loadAap(viewer: Viewer, build: string): AapData | null {
  const b = viewer.business;
  if (!b) return null;
  return { business: b, team: FIXTURE.people.filter((p) => p.business === b.id).length, build };
}
