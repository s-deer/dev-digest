import type {
  Agent,
  BlastRadiusResponse,
  ConventionsState,
  ConventionStatus,
  PrMeta,
  Repo,
  ReviewRecord,
  RunSummary,
  StartRunResponse,
} from '@devdigest/shared';

/**
 * Ring 2 — the only thing tools depend on. `HttpDevDigestApi` (ring 4) is the
 * real implementation; tests swap in `test/fakes.ts#FakeDevDigestApi`.
 */
export interface DevDigestApi {
  listAgents(): Promise<Agent[]>;
  listRepos(): Promise<Repo[]>;
  getConventions(repoId: string, statuses: ConventionStatus[]): Promise<ConventionsState>;
  /** `POST /runs`: start (or reuse) a run for one agent on a PR. */
  startRun(input: { repoId: string; prNumber: number; agentId: string }): Promise<StartRunResponse>;
  /** `GET /pulls/:id/reviews`: every persisted review of a PR with findings, newest first. */
  listPullReviews(prId: string): Promise<ReviewRecord[]>;
  /** `GET /pulls/:id/runs`: the PR's run history (any status, incl. running/failed), newest first. */
  listPullRuns(prId: string): Promise<RunSummary[]>;
  /** `GET /repos/:id/pulls`: PRs imported for a repo, to resolve a PR number to its uuid. */
  listPulls(repoId: string): Promise<PrMeta[]>;
  /** `GET /pulls/:id/blast`: the PR's changed symbols, callers, and reached endpoints/crons. */
  getBlastRadius(prId: string): Promise<BlastRadiusResponse>;
}
