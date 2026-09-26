import { z } from 'zod';
import { Finding, Verdict } from './findings.js';
import { PrIntent, SmartDiff } from './brief.js';

/**
 * A2 — Review-Core API surface contracts. These extend the core
 * Review/Finding/Intent/SmartDiff contracts with the persisted/transport shapes
 * the reviewer endpoints return. A2 owns this file; the barrel re-exports it.
 *
 * Distinct from `Finding` (the raw LLM-output unit): `FindingRecord` adds the
 * persisted row identity + action timestamps so the UI can render accept/dismiss
 * state and the `review_id` it belongs to.
 */

export const FindingRecord = Finding.extend({
  review_id: z.string(),
  accepted_at: z.string().nullable(),
  dismissed_at: z.string().nullable(),
});
export type FindingRecord = z.infer<typeof FindingRecord>;

/** A persisted review with its kept findings + grounding summary. */
export const ReviewRecord = z.object({
  id: z.string(),
  pr_id: z.string(),
  agent_id: z.string().nullable(),
  run_id: z.string().nullable(),
  agent_name: z.string().nullish(),
  kind: z.enum(['summary', 'review']),
  verdict: Verdict.nullable(),
  summary: z.string().nullable(),
  score: z.number().int().nullable(),
  model: z.string().nullable(),
  grounding: z.string().nullish(),
  // Usage of the run that produced this review (joined via run_id); null when
  // the run is gone or has no data.
  tokens_in: z.number().int().nullish(),
  tokens_out: z.number().int().nullish(),
  cost_usd: z.number().nullish(),
  created_at: z.string(),
  findings: z.array(FindingRecord),
});
export type ReviewRecord = z.infer<typeof ReviewRecord>;

/**
 * Response of `POST /pulls/:id/review`. Each requested agent produces a run that
 * streams over SSE at `/runs/:runId/events`; clients subscribe per run. The
 * persisted reviews are also returned once the (synchronous) run completes.
 */
export const ReviewRunTarget = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
});
export type ReviewRunTarget = z.infer<typeof ReviewRunTarget>;

export const ReviewRunResponse = z.object({
  pr_id: z.string(),
  runs: z.array(ReviewRunTarget),
  reviews: z.array(ReviewRecord),
});
export type ReviewRunResponse = z.infer<typeof ReviewRunResponse>;

/**
 * Persisted PR intent (Intent Layer / L03): the derived `PrIntent` plus the
 * cache key (`pr_id` + `head_sha`), staleness, and the provider/model/cost
 * that produced it.
 */
export const PrIntentRecord = PrIntent.extend({
  pr_id: z.string(),
  head_sha: z.string(),
  /** True when `head_sha` no longer matches the PR's current head. */
  stale: z.boolean(),
  provider: z.string(),
  model: z.string(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  /** Cost of the single LLM call that produced this intent; null when unpriced. */
  cost_usd: z.number().nullable(),
  /** Running total across every (re)generation of this PR's intent. */
  cost_usd_total: z.number().nullable(),
  updated_at: z.string(),
});
export type PrIntentRecord = z.infer<typeof PrIntentRecord>;

/** Response of `GET /pulls/:id/intent`; `intent` is null before the first generation. */
export const PrIntentResponse = z.object({
  intent: PrIntentRecord.nullable(),
});
export type PrIntentResponse = z.infer<typeof PrIntentResponse>;

/** Body of `POST /pulls/:id/intent`; `force` bypasses the head_sha/inputs_hash cache. */
export const GenerateIntentBody = z
  .object({
    force: z.boolean().default(false),
  })
  .strict();
export type GenerateIntentBody = z.infer<typeof GenerateIntentBody>;

/** Smart-diff response for a PR (the SmartDiff). */
export const SmartDiffResponse = SmartDiff;
export type SmartDiffResponse = z.infer<typeof SmartDiffResponse>;
