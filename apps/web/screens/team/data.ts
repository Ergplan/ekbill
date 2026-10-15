import { FIXTURE, type Person } from '../fixtures';
import type { Viewer } from '../viewer';

/** The members of the viewer's business (owner only reaches the screen). */
export function loadTeam(viewer: Viewer): Person[] {
  const b = viewer.business;
  if (!b) return [];
  return FIXTURE.people.filter((p) => p.business === b.id);
}
