import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});
export type Intent = z.infer<typeof Intent>;

// ---- PR intent (Intent Layer / L03) ----
export const IntentChangeType = z.enum([
  'feature',
  'bugfix',
  'refactor',
  'perf',
  'security',
  'docs',
  'test',
  'chore',
  'deps',
  'config',
  'other',
]);
export type IntentChangeType = z.infer<typeof IntentChangeType>;

export const IntentConfidence = z.enum(['high', 'medium', 'low']);
export type IntentConfidence = z.infer<typeof IntentConfidence>;

export const IntentSourceKind = z.enum([
  'title',
  'description',
  'issue',
  'plan',
  'spec',
  'branch',
  'commits',
  'files',
  'external_ref',
]);
export type IntentSourceKind = z.infer<typeof IntentSourceKind>;

export const IntentSource = z.object({
  kind: IntentSourceKind,
  ref: z.string(),
  fetched: z.boolean(),
  note: z.string().nullish(),
});
export type IntentSource = z.infer<typeof IntentSource>;

/** Intent derived once per PR (per head SHA), with change type, confidence, and sources. */
export const PrIntent = Intent.extend({
  change_type: IntentChangeType,
  confidence: IntentConfidence,
  confidence_score: z.number().min(0).max(1),
  sources: z.array(IntentSource),
  missing_docs: z.boolean(),
});
export type PrIntent = z.infer<typeof PrIntent>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Composed PR Brief (pr_brief.json) ----
export const PrBrief = z.object({
  intent: Intent,
  blast: BlastRadius,
  risks: Risks,
  history: PrHistory,
});
export type PrBrief = z.infer<typeof PrBrief>;

// ---- Generated PR Brief (L05) ----
// Model output schema: field order is observe -> classify (evidence first,
// verdict last) so the model grounds a risk before it labels it.
// Strict structured output turns a Zod `.optional()` into a required, non-null
// property, so nothing reachable from this schema may use `.optional()` or
// `.nullish()`: `line` is `.nullable()` (the model returns null when no single line applies).
export const BriefRiskOut = z.object({
  file_refs: z.array(z.string()).min(1),
  line: z.number().int().min(1).nullable(),
  explanation: z.string(),
  title: z.string(),
  kind: z.string(),
  severity: RiskSeverity,
});
export type BriefRiskOut = z.infer<typeof BriefRiskOut>;

/**
 * Stored/API risk. Read-side only: it is never sent to the model, so `line`
 * may be `.nullish()` here (briefs stored before revision 2 have no `line`).
 * `.extend` keeps the key position, so `line` stays right after `file_refs`.
 */
export const BriefRiskRecord = BriefRiskOut.extend({
  line: z.number().int().min(1).nullish(),
});
export type BriefRiskRecord = z.infer<typeof BriefRiskRecord>;

export const BriefFocusItem = z.object({
  file: z.string().min(1),
  line: z.number().int().min(1),
  reason: z.string().min(1),
});
export type BriefFocusItem = z.infer<typeof BriefFocusItem>;

export const BriefModelOutput = z.object({
  summary: z.string().min(1).max(600),
  risks: z.array(BriefRiskOut).max(6),
  review_focus: z.array(BriefFocusItem).max(8),
});
export type BriefModelOutput = z.infer<typeof BriefModelOutput>;

/** What inputs were available when the brief was generated. */
export const BriefFacts = z.object({
  intent: z.enum(['present', 'stale', 'missing']),
  blast: z.object({
    status: z.enum(['present', 'degraded', 'unavailable']),
    reason: z.string().optional(),
  }),
  linked_issue: z.enum(['present', 'none']),
  description: z.enum(['present', 'empty']),
  specs: z.object({
    status: z.enum(['included', 'none_attached', 'no_agent', 'unavailable']),
    agent: z.object({ id: z.string(), name: z.string() }).nullable(),
    included_paths: z.array(z.string()),
    omitted_paths: z.array(z.string()),
  }),
});
export type BriefFacts = z.infer<typeof BriefFacts>;

export const BriefReduction = z.object({
  source: z.enum(['intent', 'blast', 'diff_stats', 'description', 'specs']),
  tokens_before: z.number().int(),
  tokens_after: z.number().int(),
  items_omitted: z.number().int(),
});
export type BriefReduction = z.infer<typeof BriefReduction>;

export const BriefUsage = z.object({
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  cost_usd: z.number().nullable(),
  attempts: z.number().int(),
  input_tokens_total: z.number().int(),
  input_tokens_by_source: z.record(z.string(), z.number().int()),
});
export type BriefUsage = z.infer<typeof BriefUsage>;

/** Counters for what the grounding gate dropped or repaired. */
export const BriefGrounding = z.object({
  risks_dropped: z.number().int(),
  risk_refs_removed: z.number().int(),
  focus_dropped: z.number().int(),
  focus_lines_snapped: z.number().int(),
  // Absent counters (briefs stored before revision 2) mean zero.
  risk_lines_snapped: z.number().int().optional(),
  risk_lines_dropped: z.number().int().optional(),
});
export type BriefGrounding = z.infer<typeof BriefGrounding>;

/** Stored shape of `pr_brief.json`. */
export const PrBriefRecord = z.object({
  summary: z.string(),
  risks: z.array(BriefRiskRecord),
  review_focus: z.array(BriefFocusItem),
  head_sha: z.string(),
  generated_at: z.string(),
  provider: z.string(),
  model: z.string(),
  usage: BriefUsage,
  reductions: z.array(BriefReduction),
  facts: BriefFacts,
  grounding: BriefGrounding,
});
export type PrBriefRecord = z.infer<typeof PrBriefRecord>;

export const PrBriefResponse = z.object({
  brief: PrBriefRecord.nullable(),
  stale: z.boolean(),
});
export type PrBriefResponse = z.infer<typeof PrBriefResponse>;
