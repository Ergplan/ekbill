import { describe, expect, it } from 'vitest';

import { getPool } from '../../packages/db/src/pool';
import { BROKEN_SNAPSHOT } from '../../scripts/snapshot-check.mjs';

/** Stage 10 review: the restore check counts a snapshot with a total missing as broken, not as whole. */
describe('restore check: an issued snapshot is whole only with its totals adding up', () => {
  const broken = async (snapshot: unknown) =>
    (
      await getPool().query(`select ${BROKEN_SNAPSHOT} as broken from (values ($1::jsonb)) as t(issued_snapshot)`, [
        snapshot === null ? null : JSON.stringify(snapshot),
      ])
    ).rows[0].broken as boolean;

  it('whole', async () => {
    expect(await broken({ totals: { totalPaise: 1000, totalBeforeRoundingPaise: 1040, roundOffPaise: -40 } })).toBe(
      false,
    );
  });

  it('missing, empty, a total missing, or not adding up', async () => {
    expect(await broken(null)).toBe(true);
    expect(await broken({})).toBe(true);
    expect(await broken({ totals: { totalPaise: 1000, totalBeforeRoundingPaise: 1000 } })).toBe(true);
    expect(await broken({ totals: { totalPaise: 1000, totalBeforeRoundingPaise: 1040, roundOffPaise: 0 } })).toBe(true);
  });
});
