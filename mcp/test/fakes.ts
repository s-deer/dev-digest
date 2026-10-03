import type {
  Agent,
  BlastRadiusResponse,
  ConventionsState,
  ConventionStatus,
  FindingRecord,
  PrMeta,
  Repo,
  ReviewRecord,
  RunSummary,
  StartRunResponse,
} from '@devdigest/shared';
import type { DevDigestApi } from '../src/api/port.js';
import { ApiError } from '../src/api/errors.js';

export function buildAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    name: 'Reviewer',
    description: 'Reviews pull requests',
    provider: 'openai',
    model: 'gpt-5',
    system_prompt: 'You are a reviewer.',
    output_schema: null,
    enabled: true,
    version: 1,
    strategy: 'single-pass',
    ci_fail_on: 'critical',
    repo_intel: true,
    skill_count: 0,
    ...overrides,
  };
}

export function buildRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'repo-1',
    workspace_id: 'ws-1',
    owner: 'acme',
    name: 'payments-api',
    full_name: 'acme/payments-api',
    default_branch: 'main',
    clone_path: '/secret/clones/acme/payments-api',
    last_polled_at: null,
    created_by: null,
    ...overrides,
  };
}

export function buildConventionsState(overrides: Partial<ConventionsState> = {}): ConventionsState {
  return {
    last_scan: null,
    candidates: [],
    counts: { pending: 0, accepted: 0, rejected: 0 },
    ...overrides,
  };
}

export function buildStartRunResponse(overrides: Partial<StartRunResponse> = {}): StartRunResponse {
  return {
    run_id: 'run-1',
    status: 'running',
    reused: false,
    pr_id: 'pr-1',
    agent_id: 'agent-1',
    agent_name: 'Reviewer',
    ...overrides,
  };
}

export function buildFinding(overrides: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: 'f1',
    severity: 'WARNING',
    category: 'bug',
    title: 'Finding',
    file: 'src/index.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'Because.',
    suggestion: null,
    confidence: 0.7,
    kind: 'finding',
    trifecta_components: null,
    evidence: null,
    review_id: 'review-1',
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

export function buildPrMeta(overrides: Partial<PrMeta> = {}): PrMeta {
  return {
    id: 'pr-1',
    number: 482,
    title: 'Add feature',
    author: 'octocat',
    branch: 'feature',
    base: 'main',
    head_sha: 'abc123',
    additions: 12,
    deletions: 3,
    files_count: 2,
    status: 'open',
    opened_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    score: null,
    cost_usd: null,
    findings: null,
    ...overrides,
  };
}

export function buildBlastRadiusResponse(overrides: Partial<BlastRadiusResponse> = {}): BlastRadiusResponse {
  return {
    changed_symbols: [{ name: 'reviewPr', file: 'src/modules/reviews/helpers.ts', kind: 'function' }],
    downstream: [
      {
        symbol: 'reviewPr',
        callers: [{ name: 'runReview', file: 'src/modules/reviews/service.ts', line: 42 }],
        endpoints_affected: ['POST /runs'],
        crons_affected: [],
      },
    ],
    summary: '1 changed symbol, 1 caller, 1 endpoint affected.',
    degraded: false,
    reason: null,
    ...overrides,
  };
}

export function buildReviewRecord(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: 'review-1',
    pr_id: 'pr-1',
    agent_id: 'agent-1',
    run_id: 'run-1',
    agent_name: 'Reviewer',
    kind: 'review',
    verdict: 'approve',
    summary: 'Looks good.',
    score: 80,
    model: 'gpt-5',
    grounding: null,
    tokens_in: null,
    tokens_out: null,
    cost_usd: 0.01,
    created_at: '2026-01-01T00:00:00.000Z',
    findings: [],
    ...overrides,
  };
}

export function buildRunSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    run_id: 'run-1',
    agent_id: 'agent-1',
    agent_name: 'Reviewer',
    provider: 'openai',
    model: 'gpt-5',
    status: 'done',
    error: null,
    duration_ms: 1200,
    tokens_in: null,
    tokens_out: null,
    cost_usd: 0.01,
    findings_count: 0,
    grounding: null,
    ran_at: '2026-01-01T00:00:00.000Z',
    score: 80,
    blockers: 0,
    findings: null,
    ...overrides,
  };
}

/** Hermetic stand-in for `HttpDevDigestApi` — see `src/api/port.ts`. */
export class FakeDevDigestApi implements DevDigestApi {
  agents: Agent[] = [];
  repos: Repo[] = [];
  conventionsByRepoId = new Map<string, ConventionsState>();
  startRunResponse: StartRunResponse = buildStartRunResponse();
  reviewsByPrId = new Map<string, ReviewRecord[]>();
  runsByPrId = new Map<string, RunSummary[]>();
  pullsByRepoId = new Map<string, PrMeta[]>();
  blastByPrId = new Map<string, BlastRadiusResponse>();
  /** Records every `prId` passed to `getBlastRadius`, so a test can assert
   *  it was called once with the resolved PR's id. */
  blastCalls: string[] = [];
  failWith: Error | null = null;
  /** Fails only `startRun`, independent of `failWith` — so a test can make
   *  `resolveRepo`'s `listRepos()` call succeed while `startRun` itself fails. */
  startRunFailWith: Error | null = null;
  /** Fails only `listPulls`, independent of `failWith` — same reason. */
  listPullsFailWith: Error | null = null;
  /** Fails only `listPullReviews`, independent of `failWith` — same reason. */
  listPullReviewsFailWith: Error | null = null;
  /** Fails only `listPullRuns`, independent of `failWith` — same reason. */
  listPullRunsFailWith: Error | null = null;
  /** Fails only `getBlastRadius`, independent of `failWith` — same reason. */
  getBlastRadiusFailWith: Error | null = null;

  async listAgents(): Promise<Agent[]> {
    if (this.failWith) throw this.failWith;
    return this.agents;
  }

  async listRepos(): Promise<Repo[]> {
    if (this.failWith) throw this.failWith;
    return this.repos;
  }

  async getConventions(repoId: string, statuses: ConventionStatus[]): Promise<ConventionsState> {
    if (this.failWith) throw this.failWith;
    const state = this.conventionsByRepoId.get(repoId) ?? buildConventionsState();
    return {
      ...state,
      candidates: state.candidates.filter((c) => statuses.includes(c.status)),
    };
  }

  async startRun(_input: { repoId: string; prNumber: number; agentId: string }): Promise<StartRunResponse> {
    if (this.startRunFailWith) throw this.startRunFailWith;
    if (this.failWith) throw this.failWith;
    return this.startRunResponse;
  }

  async listPullReviews(prId: string): Promise<ReviewRecord[]> {
    if (this.listPullReviewsFailWith) throw this.listPullReviewsFailWith;
    if (this.failWith) throw this.failWith;
    return this.reviewsByPrId.get(prId) ?? [];
  }

  async listPullRuns(prId: string): Promise<RunSummary[]> {
    if (this.listPullRunsFailWith) throw this.listPullRunsFailWith;
    if (this.failWith) throw this.failWith;
    return this.runsByPrId.get(prId) ?? [];
  }

  async listPulls(repoId: string): Promise<PrMeta[]> {
    if (this.listPullsFailWith) throw this.listPullsFailWith;
    if (this.failWith) throw this.failWith;
    return this.pullsByRepoId.get(repoId) ?? [];
  }

  async getBlastRadius(prId: string): Promise<BlastRadiusResponse> {
    this.blastCalls.push(prId);
    if (this.getBlastRadiusFailWith) throw this.getBlastRadiusFailWith;
    if (this.failWith) throw this.failWith;
    const blast = this.blastByPrId.get(prId);
    if (!blast) throw new ApiError('not_found', `Blast radius for PR ${prId} not found.`);
    return blast;
  }
}
