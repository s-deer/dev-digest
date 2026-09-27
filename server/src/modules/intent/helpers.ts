import type { PrIntentRecord } from '@devdigest/shared';
import type { StoredIntent } from './domain.js';

/**
 * Maps the persisted intent (`StoredIntent`, `IntentRepository`'s domain
 * shape — no Drizzle row type here) to the wire `PrIntentRecord`: drops the
 * cache-only `inputs_hash` and adds `stale`, computed against the PR's
 * *current* head SHA (not the one the intent was derived against). Pure — the
 * row → domain-shape mapping (numeric coercion, jsonb `sources` parse, ISO
 * timestamps) lives in `IntentRepository`, not here.
 */
export function toIntentRecord(row: StoredIntent, currentHeadSha: string): PrIntentRecord {
  const { inputs_hash: _inputsHash, ...rest } = row;
  return { ...rest, stale: row.head_sha !== currentHeadSha };
}
