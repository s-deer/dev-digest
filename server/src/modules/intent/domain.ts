import { createHash } from 'node:crypto';
import { normalize, extname, basename } from 'node:path/posix';
import type { RepoRef, IntentChangeType, IntentConfidence, IntentSource } from '@devdigest/shared';
import { wrapUntrusted } from '../../platform/prompt.js';
import {
  COMMIT_SUBJECT_MAX_CHARS,
  CONFIDENCE_SCORE,
  DESCRIPTION_MAX_CHARS,
  DOC_BASENAME_HINT,
  DOC_EXTENSIONS,
  DOC_MAX_CHARS,
  DOCS_TOTAL_MAX_CHARS,
  DOC_PATH_HINT,
  INTENT_PROMPT_VERSION,
  ISSUE_BODY_MAX_CHARS,
  MAX_COMMITS,
  MAX_DOCS,
  MAX_EXTERNAL_REFS,
  MAX_FILE_PATHS,
  MAX_ISSUES,
  SUBSTANTIVE_DESCRIPTION_MIN_CHARS,
} from './constants.js';

/**
 * Pure evidence-gathering logic for the Intent Layer (L03): extracting
 * references from PR text, validating repo-relative paths, scoring
 * confidence, hashing cache keys, and rendering the LLM user message. No I/O —
 * fetching the extracted refs (issues, docs) is the caller's job
 * (`modules/intent/service.ts`, Phase 3).
 */

// ---------- domain shapes (the IntentStorePort's language — no db/** types) ----------

/** Plain PR fields `IntentService` needs — never a Drizzle row type. */
export interface IntentPull {
  id: string;
  number: number;
  title: string;
  body: string | null;
  branch: string;
  headSha: string;
}

/** What `IntentRepository.loadInputs` gives the service to derive an intent from. */
export interface IntentInputs {
  pull: IntentPull;
  repo: { owner: string; name: string; fullName: string };
  /** Commit subjects, oldest first (`pr_commits.message`, ordered by `committed_at`). */
  commits: string[];
  /** Changed file paths, as last recorded on `pr_files`. */
  filePaths: string[];
}

/**
 * The persisted `pr_intent` row, mapped to a domain shape by `IntentRepository`
 * (numeric coercion, jsonb `sources` parse, ISO dates) — never a Drizzle row
 * type. Same field names as the wire `PrIntentRecord` plus `inputs_hash`,
 * which is cache-key-only and never leaves the server.
 */
export interface StoredIntent {
  intent: string;
  in_scope: string[];
  out_of_scope: string[];
  change_type: IntentChangeType;
  confidence: IntentConfidence;
  confidence_score: number;
  sources: IntentSource[];
  missing_docs: boolean;
  pr_id: string;
  head_sha: string;
  /** Cache key alongside `head_sha`; internal only — not part of `PrIntentRecord`. */
  inputs_hash: string;
  provider: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number | null;
  cost_usd_total: number | null;
  updated_at: string;
}

export interface UpsertIntentInput {
  prId: string;
  workspaceId: string;
  intent: string;
  inScope: string[];
  outOfScope: string[];
  headSha: string;
  inputsHash: string;
  changeType: IntentChangeType;
  confidence: IntentConfidence;
  confidenceScore: number;
  missingDocs: boolean;
  sources: IntentSource[];
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  /** Cost of this single generation; null when the provider doesn't price the model. */
  costUsd: number | null;
}

// ---------- repo-identity helpers ----------

function isSameRepo(ownerRepo: string, repo: RepoRef): boolean {
  return ownerRepo.toLowerCase() === `${repo.owner}/${repo.name}`.toLowerCase();
}

// ---------- issue refs ----------

export interface IssueRef {
  n: number;
  /** Matched via a closing keyword ("closes #471") rather than a bare mention. */
  closing: boolean;
}

const CLOSING_KEYWORD_RE =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)[:\s]+(?:([\w.-]+\/[\w.-]+))?#(\d+)/gi;
const GITHUB_ISSUE_URL_RE = /github\.com\/([\w.-]+\/[\w.-]+)\/(?:issues|pull)\/(\d+)/gi;
const REPO_HASH_RE = /\b([\w.-]+\/[\w.-]+)#(\d+)\b/g;
const BARE_HASH_RE = /(^|[^\w/])#(\d+)\b/g;

/**
 * Recognizes `closes #N`, `#N`, `owner/repo#N`, and GitHub issue/PR URLs.
 * Only same-repo matches are returned (cross-repo mentions are the caller's
 * to surface via `extractExternalRefs`, since we never fetch another repo's
 * issues). Deduped by issue number, capped to `MAX_ISSUES`.
 */
export function extractIssueRefs(text: string, repo: RepoRef): IssueRef[] {
  const found = new Map<number, boolean>();
  const consider = (repoPart: string | undefined, nStr: string, closing: boolean) => {
    if (repoPart && !isSameRepo(repoPart, repo)) return;
    const n = Number(nStr);
    if (!Number.isFinite(n) || n <= 0) return;
    found.set(n, (found.get(n) ?? false) || closing);
  };

  for (const m of text.matchAll(CLOSING_KEYWORD_RE)) consider(m[1], m[2]!, true);
  for (const m of text.matchAll(GITHUB_ISSUE_URL_RE)) consider(m[1], m[2]!, false);
  for (const m of text.matchAll(REPO_HASH_RE)) consider(m[1], m[2]!, false);
  for (const m of text.matchAll(BARE_HASH_RE)) consider(undefined, m[2]!, false);

  return [...found.entries()].map(([n, closing]) => ({ n, closing })).slice(0, MAX_ISSUES);
}

/** Any bare `http(s)://` URL — shared by doc-ref bare-token stripping and external-ref extraction. */
const URL_RE = /https?:\/\/\S+/gi;

// ---------- doc refs (plan / spec) ----------

export interface DocRef {
  path: string;
  kind: 'plan' | 'spec';
}

const MD_LINK_RE = /\[[^\]]*\]\(([^)\s]+)\)/g;
const BACKTICK_RE = /`([^`\s]+)`/g;
const BLOB_LINK_RE = /github\.com\/([\w.-]+\/[\w.-]+)\/blob\/[^/]+\/(\S+)/gi;
const BARE_DOC_TOKEN_RE = /\b[\w.\-/]+\.(?:md|mdx|txt|rst|adoc)\b/gi;

function matchesDocHint(path: string): boolean {
  if (DOC_PATH_HINT.test(path)) return true;
  return DOC_BASENAME_HINT.test(basename(path, extname(path)));
}

function classifyDocKind(path: string): 'plan' | 'spec' {
  if (/(^|\/)specs?(\/|$)/i.test(path)) return 'spec';
  return /spec/i.test(basename(path, extname(path))) ? 'spec' : 'plan';
}

/**
 * Collects candidate plan/spec doc paths from markdown links, backticks, bare
 * `*.md`-like tokens, and same-repo `github.com/o/r/blob/<ref>/<path>` links in
 * `text`, then appends changed files matching `DOC_PATH_HINT` /
 * `DOC_BASENAME_HINT`. Every candidate passes `safeRepoPath`; body refs come
 * first, deduped, capped to `MAX_DOCS`.
 */
export function extractDocRefs(text: string, repo: RepoRef, changedPaths: string[]): DocRef[] {
  const ordered: string[] = [];
  const pushCandidate = (raw: string) => {
    const safe = safeRepoPath(raw);
    if (safe) ordered.push(safe);
  };

  // Bare-token matching runs over a URL-stripped copy: its character class
  // allows `/` (for repo-relative paths), so it would otherwise also match
  // the tail of a `https://github.com/...` link already handled below.
  const withoutUrls = text.replace(URL_RE, ' ');

  for (const m of text.matchAll(MD_LINK_RE)) pushCandidate(m[1]!);
  for (const m of text.matchAll(BACKTICK_RE)) pushCandidate(m[1]!);
  for (const m of withoutUrls.matchAll(BARE_DOC_TOKEN_RE)) pushCandidate(m[0]);
  for (const m of text.matchAll(BLOB_LINK_RE)) {
    if (isSameRepo(m[1]!, repo)) pushCandidate(m[2]!);
  }
  for (const path of changedPaths) {
    if (matchesDocHint(path)) pushCandidate(path);
  }

  const seen = new Set<string>();
  const result: DocRef[] = [];
  for (const path of ordered) {
    if (seen.has(path) || result.length >= MAX_DOCS) continue;
    seen.add(path);
    result.push({ path, kind: classifyDocKind(path) });
  }
  return result;
}

/** Allowlist for repo-relative doc paths: word chars, `.`, `-`, `/`, space. Rejects
 *  `<`, `>`, `"`, backticks, and other characters that could break out of a
 *  Markdown fence or an untrusted-block attribute when the path is rendered
 *  into the LLM prompt (see `renderIntentUserMessage`). */
const SAFE_PATH_CHARS_RE = /^[\w.\-/ ]+$/;

/**
 * Rejects anything unsafe to pass to `git show <ref>:<path>` or the GitHub
 * contents API, or to render into the LLM prompt: empty, a character outside
 * `SAFE_PATH_CHARS_RE`, absolute, `\`/NUL/`:`, a `..` segment after
 * `posix.normalize`, a `.git/` prefix, a leading `-` (argv-injection guard),
 * or an extension outside `DOC_EXTENSIONS`. Returns the normalized path, or
 * `null`.
 */
export function safeRepoPath(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!SAFE_PATH_CHARS_RE.test(trimmed)) return null;
  if (trimmed.startsWith('/') || trimmed.startsWith('-')) return null;
  if (trimmed.includes('\\') || trimmed.includes('\0') || trimmed.includes(':')) return null;

  const normalized = normalize(trimmed);
  if (normalized.startsWith('-')) return null;
  if (normalized === '..' || normalized.split('/').includes('..')) return null;
  if (normalized.startsWith('.git/') || normalized === '.git') return null;

  const ext = extname(normalized).toLowerCase();
  if (!(DOC_EXTENSIONS as readonly string[]).includes(ext)) return null;

  return normalized;
}

// ---------- external refs (Jira / Linear / cross-repo / other URLs) ----------

const JIRA_RE = /\b[A-Z][A-Z0-9]{1,9}-\d+\b/g;
const LINEAR_RE = /https?:\/\/linear\.app\/\S+/gi;
const GITHUB_REPO_PATH_RE = /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+\/[\w.-]+)\//i;

function stripTrailingPunctuation(raw: string): string {
  return raw.replace(/[),.;:!?\]]+$/g, '');
}

/**
 * Jira tickets, linear.app links, cross-repo issue/PR mentions, and any other
 * bare URL — recorded as a reference but never fetched (no SSRF surface: we
 * only ever call Octokit against `repo` and the local git clone). Same-repo
 * GitHub issue/PR/blob links are excluded — those are `extractIssueRefs` /
 * `extractDocRefs`'s job. Deduped, capped to `MAX_EXTERNAL_REFS`.
 */
export function extractExternalRefs(text: string, repo: RepoRef): IntentSource[] {
  const seen = new Set<string>();
  const refs: IntentSource[] = [];
  const add = (ref: string) => {
    const key = ref.toLowerCase();
    if (seen.has(key) || refs.length >= MAX_EXTERNAL_REFS) return;
    seen.add(key);
    refs.push({ kind: 'external_ref', ref, fetched: false, note: 'reference only — not fetched' });
  };

  for (const m of text.matchAll(JIRA_RE)) add(m[0]);
  for (const m of text.matchAll(LINEAR_RE)) add(stripTrailingPunctuation(m[0]));
  for (const m of text.matchAll(REPO_HASH_RE)) {
    if (!isSameRepo(m[1]!, repo)) add(`${m[1]}#${m[2]}`);
  }
  for (const m of text.matchAll(URL_RE)) {
    const url = stripTrailingPunctuation(m[0]);
    if (/linear\.app/i.test(url)) continue; // already captured above
    const githubMatch = url.match(GITHUB_REPO_PATH_RE);
    if (githubMatch && isSameRepo(githubMatch[1]!, repo)) continue; // same-repo — not external
    add(url);
  }

  return refs;
}

// ---------- description & conventional-commit heuristics ----------

const TEMPLATE_HEADING_RE = /^#{1,6}\s.*$/gm;
const CHECKBOX_LINE_RE = /^\s*-\s*\[[ xX]\]\s*.*$/gm;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

/** True when the body has ≥150 chars left after stripping HTML comments, checkbox lines, template headings, and URLs. */
export function isSubstantiveDescription(body: string | null | undefined): boolean {
  if (!body) return false;
  const stripped = body
    .replace(HTML_COMMENT_RE, '')
    .replace(CHECKBOX_LINE_RE, '')
    .replace(TEMPLATE_HEADING_RE, '')
    .replace(URL_RE, '');
  return stripped.replace(/\s+/g, ' ').trim().length >= SUBSTANTIVE_DESCRIPTION_MIN_CHARS;
}

const CONVENTIONAL_RE =
  /^(feat|fix|refactor|perf|docs|test|chore|build|ci|style|revert|deps|security)(\(.+\))?!?:/i;

const CONVENTIONAL_MAP: Record<string, IntentChangeType> = {
  feat: 'feature',
  fix: 'bugfix',
  refactor: 'refactor',
  perf: 'perf',
  docs: 'docs',
  test: 'test',
  chore: 'chore',
  build: 'config',
  ci: 'config',
  style: 'chore',
  revert: 'chore',
  deps: 'deps',
  security: 'security',
};

/** Conventional-commit prefix on the title, else the first matching commit subject. `null` if none match. */
export function conventionalType(title: string, commits: string[]): IntentChangeType | null {
  for (const candidate of [title, ...commits]) {
    const m = candidate.match(CONVENTIONAL_RE);
    if (m) return CONVENTIONAL_MAP[m[1]!.toLowerCase()] ?? null;
  }
  return null;
}

// ---------- confidence ----------

export interface EvidenceCapInput {
  issueFetched: boolean;
  docFetched: boolean;
  substantiveDescription: boolean;
}

/**
 * Rule-based ceiling on confidence, from evidence alone (before the LLM sees
 * anything): `high` needs (issue or plan) + a substantive description, or
 * both issue and plan; `medium` needs exactly one of the three signals;
 * `low` otherwise.
 */
export function evidenceCap(input: EvidenceCapInput): IntentConfidence {
  const { issueFetched, docFetched, substantiveDescription } = input;
  if ((issueFetched || docFetched) && substantiveDescription) return 'high';
  if (issueFetched && docFetched) return 'high';
  const signals = [issueFetched, docFetched, substantiveDescription].filter(Boolean).length;
  return signals === 1 ? 'medium' : 'low';
}

export interface FinalConfidenceResult {
  confidence: IntentConfidence;
  confidence_score: number;
  missing_docs: boolean;
}

const CONFIDENCE_RANK: Record<IntentConfidence, number> = { low: 0, medium: 1, high: 2 };

/** Final confidence = min(cap, self) by rank — the LLM's own guess can only lower the rule-based cap, never raise it. */
export function finalConfidence(cap: IntentConfidence, self: IntentConfidence): FinalConfidenceResult {
  const confidence = CONFIDENCE_RANK[self] <= CONFIDENCE_RANK[cap] ? self : cap;
  return {
    confidence,
    confidence_score: CONFIDENCE_SCORE[confidence],
    missing_docs: confidence === 'low',
  };
}

// ---------- cache key ----------

export interface InputsHashInput {
  title: string;
  body: string | null;
  branch: string;
  commits: string[];
  paths: string[];
  refs: unknown;
  provider: string;
  model: string;
}

/** sha256 of a stable JSON projection of the derivation inputs, plus `INTENT_PROMPT_VERSION` — the cache key alongside `head_sha`. */
export function inputsHash(input: InputsHashInput): string {
  const stable = {
    title: input.title,
    body: input.body,
    branch: input.branch,
    commits: input.commits,
    paths: input.paths,
    refs: input.refs,
    provider: input.provider,
    model: input.model,
    promptVersion: INTENT_PROMPT_VERSION,
  };
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

// ---------- LLM user message ----------

export interface IntentUserMessageIssue {
  number: number;
  title: string;
  body: string | null;
}

export interface IntentUserMessageDoc {
  path: string;
  kind: 'plan' | 'spec';
  /** `null` when the doc could not be read (missing at head, fetch error, …). */
  content: string | null;
}

export interface IntentUserMessageInput {
  task: string;
  title: string;
  branch: string;
  conventionalHint: IntentChangeType | null;
  description: string | null;
  issues: IntentUserMessageIssue[];
  docs: IntentUserMessageDoc[];
  commits: string[];
  paths: string[];
  externalRefs: IntentSource[];
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…[truncated ${text.length - max} chars]`;
}

/**
 * Renders the user message for `completeStructured({schemaName: 'PrIntent', …})`.
 * Order: task, title, branch, conventional hint, description, issues,
 * plan/spec docs, commits, paths, external refs. Everything the PR author (or
 * a linked issue/doc) wrote — including an issue's title, which is as
 * attacker-controlled as its body — is fenced with `wrapUntrusted`; only a
 * trusted label (issue number, doc kind) sits outside a fence. Fence labels
 * are static (`issue-<n>`, `doc-<index>`), never interpolated from
 * user-controlled text, so a crafted path/title can't break out of its
 * attribute.
 */
export function renderIntentUserMessage(input: IntentUserMessageInput): string {
  const lines: string[] = [input.task, ''];

  lines.push('Title:', wrapUntrusted('pr-title', input.title));
  lines.push('Branch:', wrapUntrusted('pr-branch', input.branch));
  if (input.conventionalHint) lines.push(`Conventional type hint: ${input.conventionalHint}`);

  lines.push('', 'Description:');
  lines.push(
    wrapUntrusted('pr-description', truncate(input.description ?? '(none provided)', DESCRIPTION_MAX_CHARS)),
  );

  if (input.issues.length > 0) {
    lines.push('', 'Linked issues:');
    for (const issue of input.issues) {
      // The title is attacker-controlled (any GitHub user can open an issue),
      // so it goes inside the fence alongside the body — never as a bare
      // trusted line the model could read as an instruction.
      lines.push(`Issue #${issue.number}:`);
      const body = truncate(issue.body ?? '(no body)', ISSUE_BODY_MAX_CHARS);
      lines.push(wrapUntrusted(`issue-${issue.number}`, `${issue.title}\n\n${body}`));
    }
  }

  if (input.docs.length > 0) {
    lines.push('', 'Plan / spec docs:');
    let budget = DOCS_TOTAL_MAX_CHARS;
    input.docs.forEach((doc, index) => {
      // `doc-<index>`, not `doc-<path>`: the path already passed
      // `safeRepoPath`, but keeping fence labels static avoids depending on
      // that allowlist to keep the `source="…"` attribute well-formed.
      const label = `doc-${index}`;
      lines.push(`${doc.kind}:`);
      if (doc.content == null) {
        lines.push(wrapUntrusted(label, `${doc.path}\n(not found at head)`));
        return;
      }
      const perDoc = Math.max(0, Math.min(DOC_MAX_CHARS, budget));
      const truncated = truncate(doc.content, perDoc);
      budget -= truncated.length;
      lines.push(wrapUntrusted(label, `${doc.path}\n\n${truncated}`));
    });
  }

  if (input.commits.length > 0) {
    lines.push('', 'Commits:');
    for (const commit of input.commits.slice(0, MAX_COMMITS)) {
      lines.push(`- ${wrapUntrusted('commit', truncate(commit, COMMIT_SUBJECT_MAX_CHARS))}`);
    }
  }

  if (input.paths.length > 0) {
    lines.push('', 'Changed paths:');
    lines.push(wrapUntrusted('pr-paths', input.paths.slice(0, MAX_FILE_PATHS).join(', ')));
  }

  if (input.externalRefs.length > 0) {
    lines.push('', 'External references (recorded, not fetched):');
    lines.push(wrapUntrusted('external-refs', input.externalRefs.map((ref) => `- ${ref.ref}`).join('\n')));
  }

  return lines.join('\n');
}

// ---------- log summary ----------

/** One-line summary of `sources` for the run log (e.g. `title; issue #471 (fetched); ABC-123 (reference only — not fetched)`). */
export function formatSourcesSummary(sources: IntentSource[]): string {
  if (sources.length === 0) return '(none)';
  return sources
    .map((source) => {
      if (source.fetched) return `${source.ref} (fetched)`;
      if (source.note) return `${source.ref} (${source.note})`;
      return source.ref;
    })
    .join('; ');
}
