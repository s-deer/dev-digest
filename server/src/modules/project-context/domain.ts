import type {
  ProjectContextRecord,
  ProjectContextSection,
  ProjectContextSkipReason,
  ProjectDocType,
} from '@devdigest/shared';
import { DOC_TYPE_SEGMENTS, MAX_PATH_CHARS } from './constants.js';

/**
 * Project Context ring 1: pure logic, no I/O. Glob matching, path safety, doc
 * typing, the budget/dedupe plan, and the `specs_read` list. Imports only
 * `@devdigest/shared` and this module's constants.
 */

// ---------- glob matching (own tiny matcher: `**`, `*`, `?`, `{a,b}`; no dependency) ----------

const REGEX_SPECIALS = /[\\^$.*+?()[\]{}|/]/;

function escapeChar(c: string): string {
  return REGEX_SPECIALS.test(c) ? `\\${c}` : c;
}

/** Index of the `}` that closes the `{` at `open`, or -1. Honors nesting. */
function closingBrace(glob: string, open: number): number {
  let depth = 0;
  for (let i = open; i < glob.length; i++) {
    if (glob[i] === '{') depth++;
    else if (glob[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

/** Split `a,b{c,d},e` on top-level commas only. */
function splitAlternatives(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(inner.slice(start));
  return parts;
}

function globToSource(glob: string): string {
  let out = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**/` = zero or more whole segments (dot-directories included); bare `**` = anything.
        if (glob[i + 2] === '/') {
          out += '(?:[^/]+/)*';
          i += 3;
        } else {
          out += '.*';
          i += 2;
        }
      } else {
        out += '[^/]*';
        i += 1;
      }
    } else if (c === '?') {
      out += '[^/]';
      i += 1;
    } else if (c === '{') {
      const close = closingBrace(glob, i);
      if (close < 0) {
        out += escapeChar(c);
        i += 1;
      } else {
        const alts = splitAlternatives(glob.slice(i + 1, close)).map(globToSource);
        out += `(?:${alts.join('|')})`;
        i = close + 1;
      }
    } else {
      out += escapeChar(c);
      i += 1;
    }
  }
  return out;
}

/** Compiled, anchored, case-sensitive matchers. Compile once per config; reuse per path. */
export type CompiledPatterns = readonly RegExp[];

export function compilePatterns(patterns: readonly string[]): CompiledPatterns {
  return patterns.map((p) => new RegExp(`^${globToSource(p)}$`));
}

export function matchesPatterns(path: string, compiled: CompiledPatterns): boolean {
  return compiled.some((re) => re.test(path));
}

// ---------- path safety ----------

/** Allowlist: word chars, `.`, `-`, `/`, space. Excludes `"`, `<`, `>`, backtick, newline, `:`, `\`. */
const SAFE_PATH_CHARS_RE = /^[\w./ -]+$/;

/**
 * A repo-relative, `.md` doc path that can never break a prompt delimiter or
 * escape the repo. At least as strict as the Intent Layer's `safeRepoPath`
 * (and, unlike it, does NOT normalize: the path must already be canonical so
 * the listing membership check is an exact string compare). Unsafe paths are
 * never listed, saved, or read.
 */
export function isSafeDocPath(path: string): boolean {
  if (path.length === 0 || path.length > MAX_PATH_CHARS) return false;
  if (!SAFE_PATH_CHARS_RE.test(path)) return false;
  if (path.startsWith('/') || path.startsWith('-') || path.endsWith('/')) return false;
  const segments = path.split('/');
  for (const seg of segments) {
    if (seg.trim().length === 0) return false; // empty (`a//b`) or blank segment
    if (seg === '.' || seg === '..' || seg === '.git') return false;
    if (seg.startsWith('-')) return false;
  }
  const base = segments[segments.length - 1]!;
  return base.length > 3 && base.toLowerCase().endsWith('.md');
}

// ---------- document type ----------

/** Nearest folder segment (scanning from the file upwards) named specs/docs/insights, else `other`. */
export function docTypeFor(path: string): ProjectDocType {
  const dirs = path.split('/').slice(0, -1);
  for (let i = dirs.length - 1; i >= 0; i--) {
    const seg = dirs[i]!;
    if ((DOC_TYPE_SEGMENTS as readonly string[]).includes(seg)) return seg as ProjectDocType;
  }
  return 'other';
}

// ---------- effective list + budget plan ----------

/** Why a doc can't be injected before budget is considered. */
export type DocState = 'ok' | Exclude<ProjectContextSkipReason, 'over_budget'>;

/** What the caller knows about one attached path (from the tree and, when read, its content). */
export interface DocFacts {
  /** Tokens of the wrapped block (`renderProjectDocBlock`). 0 when not readable. */
  tokens: number;
  /** True when the doc alone exceeds the per-document cap (or was too big to read). */
  overCap: boolean;
  state: DocState;
}

export interface SkillPathGroup {
  skillId?: string;
  skillName: string;
  paths: readonly string[];
}

export interface PlanLimits {
  docCapTokens: number;
  runBudgetTokens: number;
}

export interface ProjectContextPlan {
  /** Every effective doc in prompt order (agent list, then skill list), skipped ones included. */
  records: ProjectContextRecord[];
  /** The deduped skill list in prompt order (skipped docs included), with the skill each came from. */
  inherited: { path: string; skillId: string | null; skillName: string }[];
  /** Paths injected, in prompt order. */
  injectedPaths: string[];
  /** Docs that would be skipped as `over_budget` (the UI warning, AC-54). */
  wouldSkip: { path: string; section: ProjectContextSection }[];
  /** Injected tokens per section. */
  contextTokens: number;
  specsTokens: number;
}

export const AGENT_SOURCE = 'agent';

/**
 * The single source of truth for AC-27 (dedupe), AC-34 (cap + budget, in
 * prompt order) and AC-54 (pre-run warning). Used by both the Context tabs
 * and the run-time resolver so the two never disagree.
 *
 * Dedupe: a path attached directly appears only in the agent list; a path
 * inherited from several skills appears once, at its first position.
 * Budget: consumed in prompt order; a skipped doc consumes nothing, so a
 * smaller later doc can still fit.
 */
export function planProjectContext(input: {
  agentPaths: readonly string[];
  skillGroups: readonly SkillPathGroup[];
  facts: ReadonlyMap<string, DocFacts>;
  limits: PlanLimits;
}): ProjectContextPlan {
  const { agentPaths, skillGroups, facts, limits } = input;

  const direct = [...new Set(agentPaths)];
  const taken = new Set(direct);
  const inherited: { path: string; skillId: string | null; skillName: string }[] = [];
  for (const group of skillGroups) {
    for (const path of group.paths) {
      if (taken.has(path)) continue;
      taken.add(path);
      inherited.push({ path, skillId: group.skillId ?? null, skillName: group.skillName });
    }
  }

  const effective: { path: string; source: string; section: ProjectContextSection; order: number }[] = [
    ...direct.map((path, order) => ({ path, source: AGENT_SOURCE, section: 'project_context' as const, order })),
    ...inherited.map((d, order) => ({
      path: d.path,
      source: d.skillName,
      section: 'project_specifications' as const,
      order,
    })),
  ];

  const records: ProjectContextRecord[] = [];
  const injectedPaths: string[] = [];
  const wouldSkip: ProjectContextPlan['wouldSkip'] = [];
  let used = 0;
  let contextTokens = 0;
  let specsTokens = 0;

  for (const doc of effective) {
    const f = facts.get(doc.path);
    const base = { path: doc.path, section: doc.section, source: doc.source, order: doc.order };
    if (!f || f.state !== 'ok') {
      const reason: ProjectContextSkipReason = f && f.state !== 'ok' ? f.state : 'missing';
      records.push({ ...base, tokens: 0, status: 'skipped', reason });
      continue;
    }
    const tooBig = f.overCap || f.tokens > limits.docCapTokens;
    if (tooBig || used + f.tokens > limits.runBudgetTokens) {
      records.push({ ...base, tokens: f.tokens, status: 'skipped', reason: 'over_budget' });
      wouldSkip.push({ path: doc.path, section: doc.section });
      continue;
    }
    used += f.tokens;
    if (doc.section === 'project_context') contextTokens += f.tokens;
    else specsTokens += f.tokens;
    records.push({ ...base, tokens: f.tokens, status: 'injected' });
    injectedPaths.push(doc.path);
  }

  return { records, inherited, injectedPaths, wouldSkip, contextTokens, specsTokens };
}

// ---------- trace ----------

/** `specs_read`: injected project docs in prompt order, then Intent Layer refs not already listed (AC-38). */
export function buildSpecsRead(injectedPaths: readonly string[], intentRefs: readonly string[]): string[] {
  return [...new Set([...injectedPaths, ...intentRefs])];
}

// ---------- persistence port (ring 2) — the repository's language, no db/** types ----------

/** Who owns an attachment set: an agent (`## Project context`) or a skill (`## Project specifications`). */
export type AttachmentOwner = { kind: 'agent' | 'skill'; id: string };

export interface RepoSummary {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
}

/** One agent that uses a document, directly or through a skill (D-16: disabled ones count). */
export interface UsageRow {
  path: string;
  agentId: string;
  agentName: string;
  via: 'direct' | 'skill';
  skillName: string | null;
}

/** `agent_skills` + `skills` for one agent, ordered by `agent_skills.order`. */
export interface AgentSkillLink {
  skillId: string;
  skillName: string;
  /** `agent_skills.enabled` */
  linkEnabled: boolean;
  /** `skills.enabled` (workspace-wide kill switch) */
  skillEnabled: boolean;
}

/** Persistence the service needs — `ProjectContextRepository` (Drizzle) implements it. Every method is workspace-scoped. */
export interface ProjectContextStorePort {
  repoInWorkspace(workspaceId: string, repoId: string): Promise<RepoSummary | undefined>;
  agentInWorkspace(workspaceId: string, agentId: string): Promise<{ id: string; name: string } | undefined>;
  skillInWorkspace(workspaceId: string, skillId: string): Promise<{ id: string; name: string } | undefined>;
  /** Ordered attached paths for one owner + repo. */
  listAttachments(workspaceId: string, owner: AttachmentOwner, repoId: string): Promise<string[]>;
  /** Whole-set replace in one transaction; `paths` order becomes `position`. */
  replaceAttachments(workspaceId: string, owner: AttachmentOwner, repoId: string, paths: readonly string[]): Promise<void>;
  /** Ordered attached paths per skill id (skills without rows are absent). */
  listSkillAttachments(workspaceId: string, skillIds: readonly string[], repoId: string): Promise<Record<string, string[]>>;
  usageForRepo(workspaceId: string, repoId: string): Promise<UsageRow[]>;
  agentSkillLinks(workspaceId: string, agentId: string): Promise<AgentSkillLink[]>;
}
