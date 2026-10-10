import type {
  AgentProjectContext,
  GitClient,
  ProjectContextAttachmentItem,
  ProjectContextAttachments,
  ProjectContextLimits,
  ProjectContextListing,
  ProjectContextRecord,
  ProjectDocument,
  ProjectDocumentRead,
  ProjectDocumentUser,
  RepoRef,
  TreeEntry,
} from '@devdigest/shared';
import { renderProjectDocBlock, type ProjectDocInput } from '@devdigest/reviewer-core';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import {
  DOC_CAP_TOKENS,
  MAX_ATTACHMENTS_PER_SET,
  MAX_PREVIEW_BYTES,
  MAX_READ_BYTES,
  READ_CONCURRENCY,
  RUN_BUDGET_TOKENS,
  TOKEN_CACHE_MAX_ENTRIES,
} from './constants.js';
import {
  buildSpecsRead,
  compilePatterns,
  docTypeFor,
  isSafeDocPath,
  matchesPatterns,
  planProjectContext,
  type AttachmentOwner,
  type CompiledPatterns,
  type DocFacts,
  type DocState,
  type ProjectContextStorePort,
  type RepoSummary,
  type SkillPathGroup,
  type UsageRow,
} from './domain.js';

/**
 * ProjectContextService (ring 3): discovers Markdown docs in a repository's
 * synced default-branch tree, previews them, and manages the per-agent /
 * per-skill attachment sets. Narrow, port-based deps (no `Container`).
 *
 * Docs are read from git OBJECTS at `currentHead()` (== `origin/<branch>` after
 * `sync()`), never from the working tree and never at a PR head — so untracked
 * files, symlinks and PR-modified docs are excluded structurally. Logs (none
 * here) must carry paths/counts/tokens only, never document text.
 */

export interface ProjectContextServiceDeps {
  store: ProjectContextStorePort;
  git: GitClient;
  tokenizer: Tokenizer;
  /** Discovery globs from server config (apply to every repository). */
  patterns: readonly string[];
  limits?: Partial<{ docCapTokens: number; runBudgetTokens: number; maxAttachments: number }>;
  now?: () => Date;
}

/** The repo's tree at one commit; every read in a request uses this one sha. */
interface Snapshot {
  repo: RepoIdentity;
  ref: RepoRef;
  sha: string;
  tree: Map<string, TreeEntry>;
}

/** What the git side needs to know about a repo (a run only has these four fields). */
type RepoIdentity = Pick<RepoSummary, 'id' | 'owner' | 'name' | 'fullName'>;

/** Input of `resolveForRun`: the run's repo, the agent, and the skills that passed BOTH enable gates, in prompt order. */
export interface ResolveForRunInput {
  workspaceId: string;
  repoId: string;
  owner: string;
  name: string;
  agentId: string;
  skills: { skillId: string; name: string }[];
  /** Intent Layer plan/spec refs already fetched for this run; appended to `specsRead` after the injected docs. */
  intentRefs?: readonly string[];
}

/**
 * What a run injects and records. The executor keeps its own narrower port copy in
 * `modules/reviews/run-executor.ts` (it must not import this module); keep shared fields in sync.
 * `contextDocs`/`specsDocs` carry content; everything else is content-free. */
export interface ResolvedProjectContext {
  contextDocs: ProjectDocInput[];
  specsDocs: ProjectDocInput[];
  /** One record per effective doc in prompt order, skipped ones included. */
  records: ProjectContextRecord[];
  injectedPaths: string[];
  /** Trace `specs_read`: injected paths in prompt order, then Intent Layer refs not already listed. */
  specsRead: string[];
  tokens: { context: number; specs: number };
}

interface CountedDoc {
  tokens: number;
  empty: boolean;
}

const SYMLINK_MODE = '120000';
const SUBMODULE_MODE = '160000';

export class ProjectContextService {
  private readonly compiled: CompiledPatterns;
  private readonly docCap: number;
  private readonly runBudget: number;
  private readonly maxAttachments: number;
  /** `<repo>@<sha>:<path>` → tokens; bounded, insertion-ordered eviction. */
  private readonly tokenCache = new Map<string, CountedDoc>();

  constructor(private deps: ProjectContextServiceDeps) {
    this.compiled = compilePatterns(deps.patterns);
    this.docCap = deps.limits?.docCapTokens ?? DOC_CAP_TOKENS;
    this.runBudget = deps.limits?.runBudgetTokens ?? RUN_BUDGET_TOKENS;
    this.maxAttachments = deps.limits?.maxAttachments ?? MAX_ATTACHMENTS_PER_SET;
  }

  private get limits(): ProjectContextLimits {
    return {
      doc_cap_tokens: this.docCap,
      run_budget_tokens: this.runBudget,
      max_attachments: this.maxAttachments,
    };
  }

  // ---------- discovery ----------

  /** Every listed document of the repo's synced default branch (AC-1..AC-5, AC-8). */
  async list(workspaceId: string, repoId: string): Promise<ProjectContextListing> {
    const snap = await this.snapshot(await this.requireRepo(workspaceId, repoId));
    const entries = [...snap.tree.values()]
      .filter((e) => this.stateOfEntry(e) === 'ok')
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

    const usage = usersByPath(await this.deps.store.usageForRepo(workspaceId, repoId));
    const counted = await mapLimit(entries, READ_CONCURRENCY, (e) => this.countEntry(snap, e));

    const documents: ProjectDocument[] = entries.map((e, i) => ({
      path: e.path,
      type: docTypeFor(e.path),
      tokens: counted[i]!.tokens,
      size: e.size,
      over_cap: this.isOverCap(e, counted[i]!.tokens),
      used_by_agents: new Set((usage.get(e.path) ?? []).map((u) => u.agent_id)).size,
    }));

    return {
      documents,
      total_files: documents.length,
      total_tokens: documents.reduce((sum, d) => sum + d.tokens, 0),
      refreshed_at: (this.deps.now?.() ?? new Date()).toISOString(),
      patterns: [...this.deps.patterns],
      limits: this.limits,
    };
  }

  /** One document's full content for the preview (AC-6, AC-53). The path must be in the listing. */
  async read(workspaceId: string, repoId: string, path: string): Promise<ProjectDocumentRead> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const snap = await this.snapshot(repo);
    const entry = snap.tree.get(path);
    if (!entry || this.stateOfEntry(entry) !== 'ok') throw new NotFoundError('Document not found');
    if (entry.size > MAX_PREVIEW_BYTES) {
      throw new AppError('project_context_doc_too_large', 'Document is too large to preview', 413);
    }
    let content: string;
    try {
      content = await this.deps.git.readFileAt(snap.ref, snap.sha, path);
    } catch {
      throw new AppError('project_context_repo_unavailable', 'Repository local copy is unavailable', 503);
    }
    const tokens = this.deps.tokenizer.count(renderProjectDocBlock({ path, content }));
    const usage = usersByPath(await this.deps.store.usageForRepo(workspaceId, repoId));
    return {
      path,
      type: docTypeFor(path),
      content,
      tokens,
      over_cap: this.isOverCap(entry, tokens),
      used_by: usage.get(path) ?? [],
    };
  }

  // ---------- attachments ----------

  async getAgentAttachments(workspaceId: string, agentId: string, repoId: string): Promise<AgentProjectContext> {
    const repo = await this.requireRepo(workspaceId, repoId);
    await this.requireOwner(workspaceId, { kind: 'agent', id: agentId });
    return this.buildAgentView(workspaceId, repo, agentId);
  }

  async getSkillAttachments(workspaceId: string, skillId: string, repoId: string): Promise<ProjectContextAttachments> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const owner = await this.requireOwner(workspaceId, { kind: 'skill', id: skillId });
    return this.buildSkillView(workspaceId, repo, skillId, owner.name);
  }

  /** Whole-set replace. Any path outside the current listing rejects the whole request (AC-26). */
  async setAgentAttachments(
    workspaceId: string,
    agentId: string,
    repoId: string,
    paths: readonly string[],
  ): Promise<AgentProjectContext> {
    const repo = await this.requireRepo(workspaceId, repoId);
    await this.requireOwner(workspaceId, { kind: 'agent', id: agentId });
    await this.validateAndReplace(workspaceId, { kind: 'agent', id: agentId }, repo, paths);
    return this.buildAgentView(workspaceId, repo, agentId);
  }

  async setSkillAttachments(
    workspaceId: string,
    skillId: string,
    repoId: string,
    paths: readonly string[],
  ): Promise<ProjectContextAttachments> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const owner = await this.requireOwner(workspaceId, { kind: 'skill', id: skillId });
    await this.validateAndReplace(workspaceId, { kind: 'skill', id: skillId }, repo, paths);
    return this.buildSkillView(workspaceId, repo, skillId, owner.name);
  }

  // ---------- run time ----------

  /**
   * Resolve the documents one agent run injects (AC-27..AC-36). Never throws:
   * any failure degrades to "no docs" with a skip record per attached path.
   * One `currentHead()` sha is used for every read (AC-36); content comes from
   * git objects of the default branch, never the PR head. Token counts use the
   * same `renderProjectDocBlock` text as the listing (AC-44).
   */
  async resolveForRun(input: ResolveForRunInput): Promise<ResolvedProjectContext> {
    const intentRefs = input.intentRefs ?? [];
    const repo: RepoIdentity = {
      id: input.repoId,
      owner: input.owner,
      name: input.name,
      fullName: `${input.owner}/${input.name}`,
    };
    const empty = (records: ProjectContextRecord[] = []): ResolvedProjectContext => ({
      contextDocs: [],
      specsDocs: [],
      records,
      injectedPaths: [],
      specsRead: buildSpecsRead([], intentRefs),
      tokens: { context: 0, specs: 0 },
    });

    let agentPaths: string[];
    let skillGroups: SkillPathGroup[];
    try {
      agentPaths = await this.deps.store.listAttachments(input.workspaceId, { kind: 'agent', id: input.agentId }, repo.id);
      const bySkill = await this.deps.store.listSkillAttachments(
        input.workspaceId,
        input.skills.map((s) => s.skillId),
        repo.id,
      );
      skillGroups = input.skills.map((s) => ({ skillId: s.skillId, skillName: s.name, paths: bySkill[s.skillId] ?? [] }));
    } catch {
      return empty();
    }
    const allPaths = [...agentPaths, ...skillGroups.flatMap((g) => g.paths)];
    const limits = { docCapTokens: this.docCap, runBudgetTokens: this.runBudget };
    if (allPaths.length === 0) return empty();

    let snap: Snapshot;
    try {
      snap = await this.snapshot(repo);
    } catch {
      const facts = new Map<string, DocFacts>(
        allPaths.map((p) => [p, { tokens: 0, overCap: false, state: 'repo_unavailable' as const }]),
      );
      return empty(planProjectContext({ agentPaths, skillGroups, facts, limits }).records);
    }

    const contents = new Map<string, string>();
    const unique = [...new Set(allPaths)];
    const factEntries = await mapLimit(unique, READ_CONCURRENCY, async (path): Promise<[string, DocFacts]> => {
      const state = this.stateOfPath(snap, path);
      if (state !== 'ok') return [path, { tokens: 0, overCap: false, state }];
      const entry = snap.tree.get(path)!;
      if (entry.size > MAX_READ_BYTES) return [path, { tokens: Math.ceil(entry.size / 4), overCap: true, state: 'ok' }];
      try {
        const content = await this.deps.git.readFileAt(snap.ref, snap.sha, path);
        if (content.trim().length === 0) return [path, { tokens: 0, overCap: false, state: 'empty' }];
        const tokens = this.deps.tokenizer.count(renderProjectDocBlock({ path, content }));
        contents.set(path, content);
        return [path, { tokens, overCap: tokens > this.docCap, state: 'ok' }];
      } catch {
        return [path, { tokens: 0, overCap: false, state: 'unreadable' }];
      }
    });
    const plan = planProjectContext({ agentPaths, skillGroups, facts: new Map(factEntries), limits });

    const contextDocs: ProjectDocInput[] = [];
    const specsDocs: ProjectDocInput[] = [];
    for (const r of plan.records) {
      if (r.status !== 'injected') continue;
      const doc: ProjectDocInput = { path: r.path, content: contents.get(r.path) ?? '', tokens: r.tokens };
      (r.section === 'project_context' ? contextDocs : specsDocs).push(doc);
    }
    return {
      contextDocs,
      specsDocs,
      records: plan.records,
      injectedPaths: plan.injectedPaths,
      specsRead: buildSpecsRead(plan.injectedPaths, intentRefs),
      tokens: { context: plan.contextTokens, specs: plan.specsTokens },
    };
  }

  // ---------- internals ----------

  private async requireRepo(workspaceId: string, repoId: string): Promise<RepoSummary> {
    const repo = await this.deps.store.repoInWorkspace(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }

  private async requireOwner(workspaceId: string, owner: AttachmentOwner): Promise<{ id: string; name: string }> {
    const found =
      owner.kind === 'agent'
        ? await this.deps.store.agentInWorkspace(workspaceId, owner.id)
        : await this.deps.store.skillInWorkspace(workspaceId, owner.id);
    if (!found) throw new NotFoundError(owner.kind === 'agent' ? 'Agent not found' : 'Skill not found');
    return found;
  }

  private async validateAndReplace(
    workspaceId: string,
    owner: AttachmentOwner,
    repo: RepoSummary,
    paths: readonly string[],
  ): Promise<void> {
    if (new Set(paths).size !== paths.length) throw new ValidationError('Attachment paths must be unique');
    if (paths.length > this.maxAttachments) {
      throw new ValidationError(`At most ${this.maxAttachments} documents can be attached`);
    }
    const snap = await this.snapshot(repo);
    const invalid = paths.filter((p) => this.stateOfPath(snap, p) !== 'ok');
    if (invalid.length > 0) {
      throw new ValidationError(`${invalid.length} path(s) are not project documents of this repository`, {
        paths: invalid.slice(0, 10),
      });
    }
    await this.deps.store.replaceAttachments(workspaceId, owner, repo.id, paths);
  }

  /** Tree at the synced tip. Any git failure is the distinct "unavailable" error — never a stale list (AC-11). */
  private async snapshot(repo: RepoIdentity): Promise<Snapshot> {
    const ref: RepoRef = { owner: repo.owner, name: repo.name };
    try {
      const sha = await this.deps.git.currentHead(ref);
      const entries = await this.deps.git.listTree(ref, sha);
      return { repo, ref, sha, tree: new Map(entries.map((e) => [e.path, e])) };
    } catch {
      throw new AppError('project_context_repo_unavailable', 'Repository local copy is unavailable', 503);
    }
  }

  /** Eligibility of a tree entry as a document: regular file, safe `.md` path, matches the patterns. */
  private stateOfEntry(entry: TreeEntry): DocState {
    if (!matchesPatterns(entry.path, this.compiled)) return 'not_matched';
    if (entry.mode === SYMLINK_MODE || entry.mode === SUBMODULE_MODE || !isSafeDocPath(entry.path)) return 'unsafe';
    return 'ok';
  }

  private stateOfPath(snap: Snapshot, path: string): DocState {
    const entry = snap.tree.get(path);
    return entry ? this.stateOfEntry(entry) : 'missing';
  }

  private isOverCap(entry: TreeEntry, tokens: number): boolean {
    return entry.size > MAX_READ_BYTES || tokens > this.docCap;
  }

  /**
   * Tokens of the wrapped block exactly as injected (AC-44). Blobs above
   * `MAX_READ_BYTES` are not read: approximated as `ceil(size / 4)`.
   */
  private async countEntry(snap: Snapshot, entry: TreeEntry): Promise<CountedDoc & { unreadable: boolean }> {
    if (entry.size > MAX_READ_BYTES) {
      return { tokens: Math.ceil(entry.size / 4), empty: false, unreadable: false };
    }
    const key = `${snap.repo.fullName}@${snap.sha}:${entry.path}`;
    const hit = this.tokenCache.get(key);
    if (hit) return { ...hit, unreadable: false };
    try {
      const content = await this.deps.git.readFileAt(snap.ref, snap.sha, entry.path);
      const counted: CountedDoc = {
        tokens: this.deps.tokenizer.count(renderProjectDocBlock({ path: entry.path, content })),
        empty: content.trim().length === 0,
      };
      if (this.tokenCache.size >= TOKEN_CACHE_MAX_ENTRIES) {
        const oldest = this.tokenCache.keys().next().value;
        if (oldest !== undefined) this.tokenCache.delete(oldest);
      }
      this.tokenCache.set(key, counted);
      return { ...counted, unreadable: false };
    } catch {
      return { tokens: Math.ceil(entry.size / 4), empty: false, unreadable: true };
    }
  }

  /** Facts for the planner: state from the tree, then tokens from a (cached) read of present docs. */
  private async factsFor(snap: Snapshot, paths: readonly string[]): Promise<Map<string, DocFacts>> {
    const unique = [...new Set(paths)];
    const entries = await mapLimit(unique, READ_CONCURRENCY, async (path): Promise<[string, DocFacts]> => {
      const state = this.stateOfPath(snap, path);
      if (state !== 'ok') return [path, { tokens: 0, overCap: false, state }];
      const entry = snap.tree.get(path)!;
      const counted = await this.countEntry(snap, entry);
      const resolved: DocState = counted.unreadable ? 'unreadable' : counted.empty ? 'empty' : 'ok';
      return [path, { tokens: counted.tokens, overCap: this.isOverCap(entry, counted.tokens), state: resolved }];
    });
    return new Map(entries);
  }

  private toItem(path: string, facts: DocFacts | undefined): ProjectContextAttachmentItem {
    const missing = !facts || facts.state === 'missing' || facts.state === 'not_matched' || facts.state === 'unsafe';
    return {
      path,
      tokens: missing || !facts ? 0 : facts.tokens,
      missing,
      over_cap: !!facts && !missing && (facts.overCap || facts.tokens > this.docCap),
    };
  }

  private async buildSkillView(
    workspaceId: string,
    repo: RepoSummary,
    skillId: string,
    skillName: string,
  ): Promise<ProjectContextAttachments> {
    const paths = await this.deps.store.listAttachments(workspaceId, { kind: 'skill', id: skillId }, repo.id);
    const snap = await this.snapshot(repo);
    const facts = await this.factsFor(snap, paths);
    const plan = planProjectContext({
      agentPaths: [],
      skillGroups: [{ skillId, skillName, paths }],
      facts,
      limits: { docCapTokens: this.docCap, runBudgetTokens: this.runBudget },
    });
    const items = paths.map((p) => this.toItem(p, facts.get(p)));
    return {
      items,
      total_tokens: items.reduce((sum, i) => sum + i.tokens, 0),
      would_skip: plan.wouldSkip,
      limits: this.limits,
    };
  }

  private async buildAgentView(workspaceId: string, repo: RepoSummary, agentId: string): Promise<AgentProjectContext> {
    const agentPaths = await this.deps.store.listAttachments(workspaceId, { kind: 'agent', id: agentId }, repo.id);
    // Only skills enabled both globally and for this agent are inherited (matches the executor's filter).
    const links = (await this.deps.store.agentSkillLinks(workspaceId, agentId)).filter(
      (l) => l.linkEnabled && l.skillEnabled,
    );
    const bySkill = await this.deps.store.listSkillAttachments(
      workspaceId,
      links.map((l) => l.skillId),
      repo.id,
    );
    const skillGroups: SkillPathGroup[] = links.map((l) => ({
      skillId: l.skillId,
      skillName: l.skillName,
      paths: bySkill[l.skillId] ?? [],
    }));

    const snap = await this.snapshot(repo);
    const facts = await this.factsFor(snap, [...agentPaths, ...skillGroups.flatMap((g) => g.paths)]);
    const plan = planProjectContext({
      agentPaths,
      skillGroups,
      facts,
      limits: { docCapTokens: this.docCap, runBudgetTokens: this.runBudget },
    });

    const items = agentPaths.map((p) => this.toItem(p, facts.get(p)));
    const inherited = plan.inherited.map((d) => {
      const item = this.toItem(d.path, facts.get(d.path));
      return {
        path: d.path,
        via_skill_id: d.skillId ?? '',
        via_skill_name: d.skillName,
        tokens: item.tokens,
        missing: item.missing,
        over_cap: item.over_cap,
      };
    });
    return {
      items,
      total_tokens: items.reduce((sum, i) => sum + i.tokens, 0),
      would_skip: plan.wouldSkip,
      limits: this.limits,
      inherited,
      totals: {
        context_tokens: plan.contextTokens,
        specs_tokens: plan.specsTokens,
        total: plan.contextTokens + plan.specsTokens,
      },
    };
  }
}

function usersByPath(rows: UsageRow[]): Map<string, ProjectDocumentUser[]> {
  const out = new Map<string, ProjectDocumentUser[]>();
  for (const r of rows) {
    const list = out.get(r.path) ?? [];
    list.push({ agent_id: r.agentId, agent_name: r.agentName, via: r.via, skill_name: r.skillName });
    out.set(r.path, list);
  }
  for (const list of out.values()) {
    list.sort((a, b) => a.agent_name.localeCompare(b.agent_name) || (a.via === b.via ? 0 : a.via === 'direct' ? -1 : 1));
  }
  return out;
}

/** Map with at most `limit` in-flight calls; results keep input order. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
