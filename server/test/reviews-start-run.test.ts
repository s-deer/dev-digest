import { describe, expect, it, vi } from 'vitest';
import { StartRunUseCase, type StartRunAgent, type StartRunDeps } from '../src/modules/reviews/start-run.js';
import { NotFoundError } from '../src/platform/errors.js';

const AGENT: StartRunAgent = { id: 'agent-1', name: 'Reviewer' };
const INPUT = { repoId: 'repo-1', prNumber: 482, agentId: 'agent-1' };

function buildDeps(overrides: Partial<StartRunDeps> = {}): StartRunDeps {
  return {
    pulls: { getPullByNumber: vi.fn(async () => ({ id: 'pr-1' })) },
    runs: { findRunningRun: vi.fn(async () => undefined) },
    agents: { getById: vi.fn(async () => AGENT) },
    launch: vi.fn(async () => ({ run_id: 'run-new' })),
    ...overrides,
  };
}

describe('StartRunUseCase', () => {
  it('throws NotFoundError when the PR is missing, without launching', async () => {
    const deps = buildDeps({ pulls: { getPullByNumber: vi.fn(async () => undefined) } });
    const useCase = new StartRunUseCase(deps);

    await expect(useCase.execute('ws-1', INPUT)).rejects.toThrow(NotFoundError);
    expect(deps.launch).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the agent is missing, without launching', async () => {
    const deps = buildDeps({ agents: { getById: vi.fn(async () => undefined) } });
    const useCase = new StartRunUseCase(deps);

    await expect(useCase.execute('ws-1', INPUT)).rejects.toThrow(NotFoundError);
    expect(deps.launch).not.toHaveBeenCalled();
  });

  it('reuses an existing running run and never calls launch', async () => {
    const deps = buildDeps({ runs: { findRunningRun: vi.fn(async () => ({ run_id: 'run-existing' })) } });
    const useCase = new StartRunUseCase(deps);

    const result = await useCase.execute('ws-1', INPUT);

    expect(result).toEqual({
      run_id: 'run-existing',
      status: 'running',
      reused: true,
      pr_id: 'pr-1',
      agent_id: 'agent-1',
      agent_name: 'Reviewer',
    });
    expect(deps.launch).not.toHaveBeenCalled();
  });

  it('launches a new run when none is in flight', async () => {
    const deps = buildDeps();
    const useCase = new StartRunUseCase(deps);

    const result = await useCase.execute('ws-1', INPUT);

    expect(result).toEqual({
      run_id: 'run-new',
      status: 'running',
      reused: false,
      pr_id: 'pr-1',
      agent_id: 'agent-1',
      agent_name: 'Reviewer',
    });
    expect(deps.launch).toHaveBeenCalledTimes(1);
    expect(deps.launch).toHaveBeenCalledWith('ws-1', 'pr-1', AGENT);
  });
});
