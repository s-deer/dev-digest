import type {
  Agent,
  ConventionsState,
  ConventionStatus,
  Repo,
  RunDetail,
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
  /** `GET /runs/:id`: status + cost + (once done) review outcome + findings. */
  getRun(runId: string): Promise<RunDetail>;
}
