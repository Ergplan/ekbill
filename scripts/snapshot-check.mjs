// I2's check on a restored copy (scripts/restore-check.mjs): a SQL condition, true when an issued or cancelled
// document's snapshot is missing, lacks one of its totals, or its totals do not add up. A total that is not there
// counts as broken (Stage 10 review: cast to NULL, the comparison was unknown and the row passed).
export const BROKEN_SNAPSHOT = `(issued_snapshot is null
  or (issued_snapshot->'totals'->>'totalPaise') is null
  or (issued_snapshot->'totals'->>'totalBeforeRoundingPaise') is null
  or (issued_snapshot->'totals'->>'roundOffPaise') is null
  or (issued_snapshot->'totals'->>'totalPaise')::bigint
     <> (issued_snapshot->'totals'->>'totalBeforeRoundingPaise')::bigint
        + (issued_snapshot->'totals'->>'roundOffPaise')::bigint)`;
