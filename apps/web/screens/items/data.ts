import { FIXTURE, type Item } from '../fixtures';
import type { Viewer } from '../viewer';

export function loadItems(viewer: Viewer): Item[] {
  const b = viewer.business;
  if (!b) return [];
  return FIXTURE.items.filter((i) => i.business === b.id);
}
export function loadItem(viewer: Viewer, id: string): Item | null {
  return loadItems(viewer).find((i) => i.id === id) ?? null;
}
