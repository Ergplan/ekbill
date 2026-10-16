import { NotFoundError, items, seedItemId } from '@ekbill/db';
import { isUuid } from '@ekbill/engine';

import { FIXTURE, type Item } from '../fixtures';
import { itemViewOf } from '../people';
import type { Viewer } from '../viewer';

/** Kaam and saamaan: the rows (Stage 5) for a real session, the fixture for a look. */
export async function loadItems(viewer: Viewer): Promise<Item[]> {
  const b = viewer.business;
  if (!b) return [];
  const scope = viewer.session?.scope;
  if (scope) return (await items.listItems(scope)).map((i) => itemViewOf(i, b.id));
  return FIXTURE.items.filter((i) => i.business === b.id);
}
export async function loadItem(viewer: Viewer, id: string): Promise<Item | null> {
  const b = viewer.business;
  if (!b) return null;
  const scope = viewer.session?.scope;
  if (scope) {
    // A fixture key (the seeded demo items, as links and the flow audit name them) or the row's id.
    const rowId = isUuid(id) ? id : seedItemId(b.id, id);
    if (!rowId) return null;
    try {
      return itemViewOf(await items.getItem(scope, rowId), b.id);
    } catch (e) {
      if (e instanceof NotFoundError) return null;
      throw e;
    }
  }
  return FIXTURE.items.find((i) => i.business === b.id && i.id === id) ?? null;
}
