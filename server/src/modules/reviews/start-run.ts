import type { StartRunResponse } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';

/**
 * Minimal structured logger (pino-compatible: `(obj, msg)`), duplicated from
 * `run-executor.ts`'s `Logger` rather than imported, so this use case has no
 * import beyond `@devdigest/shared` and `platform/errors.ts` (see the
 * "Onion-architecture alignment" note in the mcp-server plan).
 */
export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
};

/** The agent shape this use case needs; a full `AgentRow` satisfies it. */
export interface StartRunAgent {
  id: string;
  name: string;
}

/** The pull shape this use case needs; a full `PullRow` satisfies it. */
export interface StartRunPull {
  id: string;
}

export interface StartRunInput {
  repoId: string;
  prNumber: number;
  agentId: string;
}

/**
 * Narrow, ring-2 collaborator ports for `StartRunUseCase`, expressed in
 * domain language rather than the DI composition root or Drizzle.
 * `ReviewService` (ring 3, a known deviation — see the onion-architecture
 * skill's "Known deviations") wires its repository/agents methods and its own
 * `runReview` into this shape in its constructor; the hermetic test wires
 * in-memory fakes instead.
 */
export interface StartRunDeps<Agent extends StartRunAgent = StartRunAgent> {
  pulls: {
    getPullByNumber(workspaceId: string, repoId: string, prNumber: number): Promise<StartRunPull | undefined>;
  };
  runs: {
    findRunningRun(workspaceId: string, prId: string, agentId: string): Promise<{ run_id: string } | undefined>;
  };
  agents: {
    getById(workspaceId: string, agentId: string): Promise<Agent | undefined>;
  };
  launch(workspaceId: string, prId: string, agent: Agent, logger?: Logger): Promise<{ run_id: string }>;
}

/**
 * Start (or reuse) a review run for one agent on a PR addressed by
 * `repoId` + its GitHub number. Used by `POST /runs` (the MCP entry point):
 *   1. Resolve the PR — missing → `NotFoundError`.
 *   2. Resolve the agent — missing → `NotFoundError`.
 *   3. If a `running` run already exists for this agent + PR, reuse it.
 *   4. Otherwise launch a new one.
 *
 * Kept separate from `ReviewService` (which takes the whole DI composition
 * root) so it takes only `StartRunDeps` and is testable without Docker — a
 * service test that needs Postgres for dedupe logic is a layering smell.
 */
export class StartRunUseCase<Agent extends StartRunAgent = StartRunAgent> {
  constructor(private readonly deps: StartRunDeps<Agent>) {}

  async execute(workspaceId: string, input: StartRunInput): Promise<StartRunResponse> {
    const pull = await this.deps.pulls.getPullByNumber(workspaceId, input.repoId, input.prNumber);
    if (!pull) {
      throw new NotFoundError('Pull request not found', { hint: "open the repo's PR list in DevDigest" });
    }
    const agent = await this.deps.agents.getById(workspaceId, input.agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    const running = await this.deps.runs.findRunningRun(workspaceId, pull.id, agent.id);
    if (running) {
      return {
        run_id: running.run_id,
        status: 'running',
        reused: true,
        pr_id: pull.id,
        agent_id: agent.id,
        agent_name: agent.name,
      };
    }

    const launched = await this.deps.launch(workspaceId, pull.id, agent);
    return {
      run_id: launched.run_id,
      status: 'running',
      reused: false,
      pr_id: pull.id,
      agent_id: agent.id,
      agent_name: agent.name,
    };
  }
}
