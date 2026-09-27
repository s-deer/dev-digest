import type { GitClient, GitHubClient, LLMProvider, PrIntentRecord, Provider, RepoRef } from '@devdigest/shared';
import { ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import {
  conventionalType,
  evidenceCap,
  extractDocRefs,
  extractExternalRefs,
  extractIssueRefs,
  finalConfidence,
  formatSourcesSummary,
  inputsHash,
  isSubstantiveDescription,
  renderIntentUserMessage,
} from './domain.js';
import type { IntentInputs, StoredIntent, UpsertIntentInput } from './domain.js';
import { IntentExtractionSchema, SYSTEM_PROMPT } from './prompt.js';
import { INTENT_MAX_TOKENS, INTENT_TEMPERATURE, INTENT_TIMEOUT_MS } from './constants.js';
import { toIntentRecord } from './helpers.js';

/**
 * IntentService: derives and caches the PR intent (Intent Layer / L03).
 * Narrow, port-based deps (no `Container`) — modeled on
 * `modules/conventions/service.ts`. `IntentStorePort` is the persistence port
 * this service needs; `IntentRepository` (Drizzle) implements it.
 */

/** Persistence port this service needs — `IntentRepository` implements it. */
export interface IntentStorePort {
  loadInputs(workspaceId: string, prId: string): Promise<IntentInputs | undefined>;
  get(workspaceId: string, prId: string): Promise<StoredIntent | undefined>;
  upsert(values: UpsertIntentInput): Promise<StoredIntent>;
  updatePullBody(workspaceId: string, prId: string, body: string): Promise<void>;
}

export interface EnsureIntentOptions {
  /** Bypasses the `head_sha` + `inputs_hash` cache and forces a fresh derivation. */
  force?: boolean;
  /** Paths from the diff about to be reviewed; preferred over the persisted `pr_files` snapshot. */
  diffPaths?: string[];
  /** Run-log sink for degraded-path notices (e.g. PR body unavailable). */
  onEvent?: (message: string) => void;
}

export interface EnsureIntentResult {
  record: PrIntentRecord;
  /** The PR body used (persisted, or freshly fetched from GitHub); null when unavailable. */
  prBody: string | null;
  /** True when the cached row already matched `head_sha` + `inputs_hash`. */
  cached: boolean;
  /**
   * One-line summary of `record.sources` for the run log (e.g. `title; issue
   * #471 (fetched)`) — computed here so callers such as
   * `modules/reviews/run-executor.ts` don't need to import `modules/intent`.
   */
  sourcesSummary: string;
}

export interface IntentServiceDeps {
  intents: IntentStorePort;
  github(): Promise<GitHubClient>;
  git: GitClient;
  resolveModel(workspaceId: string): Promise<{ provider: Provider; model: string }>;
  llm(provider: Provider): Promise<LLMProvider>;
}

const TASK =
  'Determine why this pull request exists — its intent, stated scope, and how confident that reading is — from the evidence below.';

export class IntentService {
  constructor(private deps: IntentServiceDeps) {}

  /** The cached intent, or `null` before the first generation. */
  async get(workspaceId: string, prId: string): Promise<PrIntentRecord | null> {
    const inputs = await this.deps.intents.loadInputs(workspaceId, prId);
    if (!inputs) throw new NotFoundError('Pull request not found');
    const row = await this.deps.intents.get(workspaceId, prId);
    return row ? toIntentRecord(row, inputs.pull.headSha) : null;
  }

  async ensure(
    workspaceId: string,
    prId: string,
    opts: EnsureIntentOptions = {},
  ): Promise<EnsureIntentResult> {
    const inputs = await this.deps.intents.loadInputs(workspaceId, prId);
    if (!inputs) throw new NotFoundError('Pull request not found');
    const { pull, repo, commits, filePaths } = inputs;
    const repoRef: RepoRef = { owner: repo.owner, name: repo.name };

    // ---- description: persist a fetched body so future runs skip this ------
    let body = pull.body ?? null;
    if (body == null) {
      try {
        const gh = await this.deps.github();
        const detail = await gh.getPullRequest(repoRef, pull.number);
        body = detail.body ?? null;
        if (body != null) await this.deps.intents.updatePullBody(workspaceId, prId, body);
      } catch (err) {
        opts.onEvent?.(
          `intent: PR body unavailable (${err instanceof Error ? err.message : 'fetch failed'}) — continuing without it`,
        );
      }
    }

    // ---- extract refs + cache key ------------------------------------------
    const changedPaths = opts.diffPaths && opts.diffPaths.length > 0 ? opts.diffPaths : filePaths;
    const text = `${pull.title}\n${body ?? ''}`;
    const issueRefs = extractIssueRefs(text, repoRef);
    const docRefs = extractDocRefs(text, repoRef, changedPaths);
    const externalRefs = extractExternalRefs(text, repoRef);
    const conventionalHint = conventionalType(pull.title, commits);

    const model = await this.deps.resolveModel(workspaceId);
    const hash = inputsHash({
      title: pull.title,
      body,
      branch: pull.branch,
      commits,
      paths: changedPaths,
      refs: { issues: issueRefs, docs: docRefs, external: externalRefs.map((ref) => ref.ref) },
      provider: model.provider,
      model: model.model,
    });

    if (!opts.force) {
      const existing = await this.deps.intents.get(workspaceId, prId);
      if (existing && existing.head_sha === pull.headSha && existing.inputs_hash === hash) {
        const record = toIntentRecord(existing, pull.headSha);
        return { record, prBody: body, cached: true, sourcesSummary: formatSourcesSummary(record.sources) };
      }
    }

    // ---- fetch issues (each isolated — one bad issue doesn't fail the run) -
    const fetchedIssues: { number: number; title: string; body: string | null; ok: boolean; note?: string }[] = [];
    for (const ref of issueRefs) {
      try {
        const gh = await this.deps.github();
        const issue = await gh.getIssue(repoRef, ref.n);
        fetchedIssues.push({ number: ref.n, title: issue.title, body: issue.body ?? null, ok: true });
      } catch (err) {
        fetchedIssues.push({
          number: ref.n,
          title: `#${ref.n}`,
          body: null,
          ok: false,
          note: err instanceof Error ? err.message : 'fetch failed',
        });
      }
    }

    // ---- fetch plan/spec docs at head, falling back to GitHub contents -----
    let headFetched = false;
    const ensureHeadFetched = async () => {
      if (headFetched) return;
      headFetched = true;
      try {
        await this.deps.git.fetchPullHead(repoRef, pull.number);
      } catch {
        // best-effort — the GitHub contents API fallback below still applies
      }
    };
    const fetchedDocs: { path: string; kind: 'plan' | 'spec'; content: string | null }[] = [];
    for (const doc of docRefs) {
      let content: string | null = null;
      try {
        content = await this.deps.git.readFileAt(repoRef, pull.headSha, doc.path);
      } catch {
        content = null;
      }
      if (!content) {
        await ensureHeadFetched();
        try {
          content = await this.deps.git.readFileAt(repoRef, pull.headSha, doc.path);
        } catch {
          content = null;
        }
      }
      if (!content) {
        try {
          const gh = await this.deps.github();
          content = await gh.getFileContent(repoRef, doc.path, pull.headSha);
        } catch {
          content = null;
        }
      }
      fetchedDocs.push({ path: doc.path, kind: doc.kind, content });
    }

    const issueFetched = fetchedIssues.some((issue) => issue.ok);
    const docFetched = fetchedDocs.some((doc) => doc.content != null);
    const substantiveDescription = isSubstantiveDescription(body);

    // ---- sources (for the persisted record + run-log summary) -------------
    const sources: PrIntentRecord['sources'] = [{ kind: 'title', ref: 'title', fetched: true }];
    if (body) sources.push({ kind: 'description', ref: 'description', fetched: true });
    sources.push({ kind: 'branch', ref: pull.branch, fetched: true });
    if (commits.length > 0) sources.push({ kind: 'commits', ref: `${commits.length} commits`, fetched: true });
    if (changedPaths.length > 0) {
      sources.push({ kind: 'files', ref: `${changedPaths.length} files`, fetched: true });
    }
    for (const issue of fetchedIssues) {
      sources.push({
        kind: 'issue',
        ref: `#${issue.number}`,
        fetched: issue.ok,
        ...(issue.note ? { note: issue.note } : {}),
      });
    }
    for (const doc of fetchedDocs) {
      sources.push({
        kind: doc.kind,
        ref: doc.path,
        fetched: doc.content != null,
        ...(doc.content == null ? { note: 'not found at head' } : {}),
      });
    }
    sources.push(...externalRefs);

    const userMessage = renderIntentUserMessage({
      task: TASK,
      title: pull.title,
      branch: pull.branch,
      conventionalHint,
      description: body,
      issues: fetchedIssues.map((issue) => ({ number: issue.number, title: issue.title, body: issue.body })),
      docs: fetchedDocs,
      commits,
      paths: changedPaths,
      externalRefs,
    });

    let result;
    try {
      const llm = await this.deps.llm(model.provider);
      result = await llm.completeStructured({
        model: model.model,
        schema: IntentExtractionSchema,
        schemaName: 'PrIntent',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: INTENT_TEMPERATURE,
        maxTokens: INTENT_MAX_TOKENS,
        timeoutMs: INTENT_TIMEOUT_MS,
      });
    } catch (err) {
      throw new ExternalServiceError(
        `Intent generation failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }

    const cap = evidenceCap({ issueFetched, docFetched, substantiveDescription });
    const { confidence, confidence_score, missing_docs } = finalConfidence(cap, result.data.self_confidence);
    // LLM's own classification wins; the conventional-commit hint only fills
    // in when the model couldn't tell ('other').
    const changeType =
      result.data.change_type === 'other' && conventionalHint ? conventionalHint : result.data.change_type;

    const updated = await this.deps.intents.upsert({
      prId,
      workspaceId,
      intent: result.data.intent,
      inScope: result.data.in_scope,
      outOfScope: result.data.out_of_scope,
      headSha: pull.headSha,
      inputsHash: hash,
      changeType,
      confidence,
      confidenceScore: confidence_score,
      missingDocs: missing_docs,
      sources,
      provider: model.provider,
      model: model.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
    });

    return {
      record: toIntentRecord(updated, pull.headSha),
      prBody: body,
      cached: false,
      sourcesSummary: formatSourcesSummary(sources),
    };
  }
}
