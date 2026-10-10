import { z } from 'zod';

/**
 * Project Context — repository Markdown docs attached by hand to agents
 * (`## Project context`) and skills (`## Project specifications`).
 *
 * Discovery reads the synced default-branch tip from git objects, so the
 * listing, the pre-run token warning, and the run-time injection all agree.
 */

/** Per-document limits, set by the server and rendered (never recomputed) by the UI. */
export const ProjectContextLimits = z.object({
  /** Max tokens one wrapped document block may cost before it is skipped. */
  doc_cap_tokens: z.number().int().positive(),
  /** Max tokens of all attached documents injected into one run. */
  run_budget_tokens: z.number().int().positive(),
  /** Max documents attached to one agent/skill for one repository. */
  max_attachments: z.number().int().positive(),
});
export type ProjectContextLimits = z.infer<typeof ProjectContextLimits>;

export const ProjectDocType = z.enum(['specs', 'docs', 'insights', 'other']);
export type ProjectDocType = z.infer<typeof ProjectDocType>;

/** Which attachment section a document lands in. */
export const ProjectContextSection = z.enum(['project_context', 'project_specifications']);
export type ProjectContextSection = z.infer<typeof ProjectContextSection>;

/** An agent that uses a document: directly, or through one of its skills. */
export const ProjectDocumentUser = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  via: z.enum(['direct', 'skill']),
  /** Set when `via` is 'skill'; null for a direct attachment. */
  skill_name: z.string().nullable(),
});
export type ProjectDocumentUser = z.infer<typeof ProjectDocumentUser>;

export const ProjectDocument = z.object({
  path: z.string(),
  type: ProjectDocType,
  /** Tokens of the wrapped block exactly as it would be injected. */
  tokens: z.number().int().nonnegative(),
  size: z.number().int().nonnegative(),
  /** True when the document alone exceeds the per-document cap. */
  over_cap: z.boolean(),
  used_by_agents: z.number().int().nonnegative(),
});
export type ProjectDocument = z.infer<typeof ProjectDocument>;

export const ProjectContextListing = z.object({
  documents: z.array(ProjectDocument),
  total_files: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
  refreshed_at: z.string(),
  patterns: z.array(z.string()),
  limits: ProjectContextLimits,
});
export type ProjectContextListing = z.infer<typeof ProjectContextListing>;

export const ProjectDocumentRead = z.object({
  path: z.string(),
  type: ProjectDocType,
  content: z.string(),
  tokens: z.number().int().nonnegative(),
  over_cap: z.boolean(),
  used_by: z.array(ProjectDocumentUser),
});
export type ProjectDocumentRead = z.infer<typeof ProjectDocumentRead>;

/** Whole-set replace: ordered, unique paths. */
export const SetProjectContextBody = z.object({
  repo_id: z.string().uuid(),
  paths: z
    .array(z.string().min(1))
    .max(50)
    .refine((paths) => new Set(paths).size === paths.length, { message: 'paths must be unique' }),
});
export type SetProjectContextBody = z.infer<typeof SetProjectContextBody>;

export const ProjectContextQuery = z.object({ repo_id: z.string().uuid() });
export type ProjectContextQuery = z.infer<typeof ProjectContextQuery>;

export const ProjectContextAttachmentItem = z.object({
  path: z.string(),
  tokens: z.number().int().nonnegative(),
  /** Attached, but no longer present in the repository listing. */
  missing: z.boolean(),
  over_cap: z.boolean(),
});
export type ProjectContextAttachmentItem = z.infer<typeof ProjectContextAttachmentItem>;

export const ProjectContextWouldSkip = z.object({
  path: z.string(),
  section: ProjectContextSection,
});
export type ProjectContextWouldSkip = z.infer<typeof ProjectContextWouldSkip>;

export const ProjectContextAttachments = z.object({
  items: z.array(ProjectContextAttachmentItem),
  /** Sum over present items only; missing documents are excluded. */
  total_tokens: z.number().int().nonnegative(),
  would_skip: z.array(ProjectContextWouldSkip),
  limits: ProjectContextLimits,
});
export type ProjectContextAttachments = z.infer<typeof ProjectContextAttachments>;

export const InheritedProjectDoc = z.object({
  path: z.string(),
  via_skill_id: z.string(),
  via_skill_name: z.string(),
  tokens: z.number().int().nonnegative(),
  missing: z.boolean(),
  over_cap: z.boolean(),
});
export type InheritedProjectDoc = z.infer<typeof InheritedProjectDoc>;

export const AgentProjectContext = ProjectContextAttachments.extend({
  /** Documents inherited from the agent's enabled skills, in prompt order. */
  inherited: z.array(InheritedProjectDoc),
  totals: z.object({
    context_tokens: z.number().int().nonnegative(),
    specs_tokens: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});
export type AgentProjectContext = z.infer<typeof AgentProjectContext>;

export const ProjectContextSkipReason = z.enum([
  'missing',
  'unreadable',
  'untracked',
  'not_matched',
  'unsafe',
  'empty',
  'over_budget',
  'repo_unavailable',
]);
export type ProjectContextSkipReason = z.infer<typeof ProjectContextSkipReason>;

/** One attached document as the run saw it; recorded in the run trace. */
export const ProjectContextRecord = z.object({
  path: z.string(),
  section: ProjectContextSection,
  /** Where it came from: 'agent' or the skill name. */
  source: z.string(),
  order: z.number().int().nonnegative(),
  tokens: z.number().int().nonnegative(),
  status: z.enum(['injected', 'skipped']),
  reason: ProjectContextSkipReason.optional(),
});
export type ProjectContextRecord = z.infer<typeof ProjectContextRecord>;

export const ProjectContextWarning = ProjectContextWouldSkip;
export type ProjectContextWarning = z.infer<typeof ProjectContextWarning>;
