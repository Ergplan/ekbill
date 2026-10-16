import { describe, expect, it } from 'vitest';

import { isUuid } from '../../packages/engine/src/index';

/** Stages 4 and 7 review: the file routes let 36 hyphens through to Postgres (a 500 where a 404 was meant). */
describe('isUuid', () => {
  it('takes a uuid and nothing shaped only by length', () => {
    expect(isUuid('00000000-0000-4000-8000-000000000001')).toBe(true);
    expect(isUuid('-'.repeat(36))).toBe(false);
    expect(isUuid('gggggggg-gggg-gggg-gggg-gggggggggggg')).toBe(false);
    expect(isUuid('000000000000400080000000000000000001----')).toBe(false);
  });
});
