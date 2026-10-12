import type {
  BlastRadiusResponse,
  GitHubClient,
  LLMProvider,
  PrBriefRecord,
  PrBriefResponse,
  PrIntentRecord,
  Provider,
} from '@devdigest/shared';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import { AppError, ExternalServiceError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { classifyFile } from '../smart-diff/classify.js';
import { BRIEF_MAX_TOKENS, BRIEF_TEMPERATURE, BRIEF_TIMEOUT_MS } from './constants.js';
import {
  deriveFacts,
  groundBrief,
  isStale,
  parseHunkRanges,
  type BriefLogLine,
  type BriefPullData,
  type CallerLocation,
  type LineRange,
  type SpecRecordLike,
} from './domain.js';
import { buildBriefInput, type BriefInputFacts } from './input.js';
import { BriefModelOutputEnglish } from './prompt.js';

/**
 * BriefService (L05): one bounded model call over precomputed facts, grounded
 * against the PR and stored with its head SHA. Narrow, port-based deps (no
 * `Container`); the intent, blast and project-context services arrive as ports
 * from the composition root. `get` never calls the model.
 */

/** Persistence port — `BriefRepository` implements it. */
export interface BriefStorePort {
  loadPull(workspaceId: string, prId: string): Promise<BriefPullData | undefined>;
  getStored(workspaceId: string, prId: string): Promise<PrBriefRecord | undefined>;
  save(workspaceId: string, prId: string, record: PrBriefRecord): Promise<void>;
  latestRunAgent(workspaceId: string, repoId: string): Promise<{ id: string; name: string } | undefined>;
  enabledSkills(workspaceId: string, agentId: string): Promise<{ skillId: string; name: string }[]>;
}

export interface BriefSpecsInput {
  workspaceId: string;
  repoId: string;
  owner: string;
  name: string;
  agentId: string;
  skills: { skillId: string; name: string }[];
}

export interface BriefSpecsResolved {
  contextDocs: { path: string; content: string }[];
  specsDocs: { path: string; content: string }[];
  records: SpecRecordLike[];
}

export interface BriefServiceDeps {
  store: BriefStorePort;
  intents: { get(workspaceId: string, prId: string): Promise<PrIntentRecord | null> };
  blast: { build(workspaceId: string, prId: string): Promise<BlastRadiusResponse> };
  specs: { resolveForRun(input: BriefSpecsInput): Promise<BriefSpecsResolved> };
  github(): Promise<Pick<GitHubClient, 'getPullRequest'>>;
  tokenizer: Tokenizer;
  resolveModel(workspaceId: string): Promise<{ provider: Provider; model: string }>;
  llm(provider: Provider): Promise<LLMProvider>;
  /** Epoch milliseconds; tests inject a fake clock. */
  now?: () => number;
}

export interface GenerateBriefOptions {
  /** Called exactly once per `generate`, from a `finally`, with a content-free line. */
  onFinish?: (line: BriefLogLine) => void;
}

export class BriefService {
  constructor(private deps: BriefServiceDeps) {}

  /** The stored brief (never calls the model, intent or blast). */
  async get(workspaceId: string, prId: string): Promise<PrBriefResponse> {
    const data = await this.deps.store.loadPull(workspaceId, prId);
    if (!data) throw new NotFoundError('Pull request not found');
    const brief = await this.deps.store.getStored(workspaceId, prId);
    return { brief: brief ?? null, stale: brief ? isStale(brief.head_sha, data.pull.headSha) : false };
  }

  async generate(workspaceId: string, prId: string, opts: GenerateBriefOptions = {}): Promise<PrBriefResponse> {
    const now = this.deps.now ?? Date.now;
    const startedAt = now();
    let modelMs = 0;
    const line: BriefLogLine = {
      prId,
      outcome: 'error',
      provider: null,
      model: null,
      attempts: 0,
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: null,
      input_tokens_total: 0,
      input_tokens_by_source: {},
      reductions: [],
      grounding: null,
      duration_ms_non_model: 0,
    };
    try {
      const data = await this.deps.store.loadPull(workspaceId, prId);
      if (!data) throw new NotFoundError('Pull request not found');
      if (data.files.length === 0) throw new ValidationError('This pull request has no changed files to brief');
      const { pull, repo } = data;
      const headSha = pull.headSha;

      // ---- facts (each isolated: one failure degrades instead of aborting) --
      let intent: PrIntentRecord | null = null;
      try {
        intent = await this.deps.intents.get(workspaceId, prId);
      } catch {
        intent = null;
      }
      let blast: BlastRadiusResponse | null = null;
      try {
        blast = await this.deps.blast.build(workspaceId, prId);
      } catch {
        blast = null;
      }
      let body = pull.body;
      let issue: { number: number; title: string; body: string | null } | null = null;
      try {
        const gh = await this.deps.github();
        const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pull.number);
        if (!body || body.trim() === '') body = detail.body ?? body;
        if (detail.linked_issue) {
          issue = { number: detail.linked_issue.number, title: detail.linked_issue.title, body: detail.linked_issue.body ?? null };
        }
      } catch {
        // best effort — offline / no token: no linked issue, stored body only
      }

      const agent = await this.deps.store.latestRunAgent(workspaceId, repo.id);
      let specDocs: { path: string; content: string }[] = [];
      let specRecords: SpecRecordLike[] | null = [];
      if (agent) {
        try {
          const skills = await this.deps.store.enabledSkills(workspaceId, agent.id);
          const resolved = await this.deps.specs.resolveForRun({
            workspaceId,
            repoId: repo.id,
            owner: repo.owner,
            name: repo.name,
            agentId: agent.id,
            skills,
          });
          specDocs = [...resolved.contextDocs, ...resolved.specsDocs];
          specRecords = resolved.records;
        } catch {
          specRecords = null;
        }
      }

      const facts = deriveFacts({
        intent,
        blast: blast ? { degraded: blast.degraded, reason: blast.reason } : null,
        linkedIssue: issue !== null,
        description: body,
        specs: { agent: agent ?? null, records: specRecords },
      });

      // ---- bounded input ----------------------------------------------------
      const ranges = new Map<string, LineRange[]>(data.files.map((f) => [f.path, parseHunkRanges(f.patch)]));
      const callers: CallerLocation[] = (blast?.downstream ?? []).flatMap((d) =>
        d.callers.map((c) => ({ file: c.file, line: c.line })),
      );
      const inputFacts: BriefInputFacts = {
        title: pull.title,
        intent: intent
          ? {
              intent: intent.intent,
              in_scope: intent.in_scope,
              out_of_scope: intent.out_of_scope,
              change_type: intent.change_type,
              confidence: intent.confidence,
              stale: intent.stale,
            }
          : null,
        blast: blast
          ? {
              degraded: blast.degraded,
              reason: blast.reason,
              summary: blast.summary,
              changed_symbols: blast.changed_symbols,
              downstream: blast.downstream,
            }
          : null,
        description: body,
        issue,
        specs: specDocs,
        files: data.files.map((f) => ({
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          role: classifyFile(f.path),
          ranges: ranges.get(f.path) ?? [],
        })),
      };
      const model = await this.deps.resolveModel(workspaceId);
      line.provider = model.provider;
      line.model = model.model;

      const built = buildBriefInput({ facts: inputFacts, tokenizer: this.deps.tokenizer });
      if (!built.ok) {
        line.input_tokens_total = built.tokensTotal;
        throw new AppError(
          'brief_budget_exceeded',
          'This pull request is too large to brief within the input budget',
          422,
        );
      }
      line.input_tokens_total = built.tokensTotal;
      line.input_tokens_by_source = built.tokensBySource;
      line.reductions = built.reductions;

      // Specs the budget dropped are omitted too (the record flags were set before the budget ran).
      if (built.specsOmitted.length > 0) {
        const dropped = new Set(built.specsOmitted);
        facts.specs.included_paths = facts.specs.included_paths.filter((p) => !dropped.has(p));
        facts.specs.omitted_paths = [...facts.specs.omitted_paths, ...built.specsOmitted];
      }

      // ---- the one model call ----------------------------------------------
      let result;
      try {
        const llm = await this.deps.llm(model.provider);
        const modelStart = now();
        try {
          result = await llm.completeStructured({
            model: model.model,
            schema: BriefModelOutputEnglish,
            schemaName: 'PrBrief',
            messages: [
              { role: 'system', content: built.system },
              { role: 'user', content: built.user },
            ],
            temperature: BRIEF_TEMPERATURE,
            maxTokens: BRIEF_MAX_TOKENS,
            timeoutMs: BRIEF_TIMEOUT_MS,
          });
        } finally {
          modelMs = now() - modelStart;
        }
      } catch (err) {
        throw new ExternalServiceError(
          `Brief generation failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      }
      line.attempts = result.attempts;
      line.tokens_in = result.tokensIn;
      line.tokens_out = result.tokensOut;
      line.cost_usd = result.costUsd;

      // ---- grounding on the FULL lists --------------------------------------
      const grounded = groundBrief(result.data, { changed: ranges, callers });
      line.grounding = grounded.grounding;

      const record: PrBriefRecord = {
        summary: result.data.summary,
        risks: grounded.risks,
        review_focus: grounded.review_focus,
        head_sha: headSha,
        generated_at: new Date(now()).toISOString(),
        provider: model.provider,
        model: model.model,
        usage: {
          tokens_in: result.tokensIn,
          tokens_out: result.tokensOut,
          cost_usd: result.costUsd,
          attempts: result.attempts,
          input_tokens_total: built.tokensTotal,
          input_tokens_by_source: built.tokensBySource,
        },
        reductions: built.reductions,
        facts,
        grounding: grounded.grounding,
      };
      await this.deps.store.save(workspaceId, prId, record);
      line.outcome = 'ok';
      return { brief: record, stale: false };
    } catch (err) {
      line.outcome = err instanceof AppError ? err.code : 'error';
      throw err;
    } finally {
      line.duration_ms_non_model = Math.max(0, now() - startedAt - modelMs);
      try {
        opts.onFinish?.(line);
      } catch {
        // a logging failure must never mask the result
      }
    }
  }
}
