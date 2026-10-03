import { describe, it, expect } from 'vitest';
import { BlastService } from '../src/modules/blast/service.js';
import type { BlastScope, BlastSourcePort } from '../src/modules/blast/service.js';
import type { BlastResult, RepoIntel } from '../src/modules/repo-intel/types.js';

/** Fake `BlastSourcePort` — hermetic, no Db, no Docker. Keyed by `prId`, so a
 *  PR absent from `pulls` (or resolved under a different workspace) behaves
 *  exactly like tenancy scoping would. */
class FakeBlastSource implements BlastSourcePort {
  constructor(private prs: Record<string, { workspaceId: string; repoId: string; changedFiles: string[] }>) {}

  async loadScope(workspaceId: string, prId: string): Promise<BlastScope | undefined> {
    const pr = this.prs[prId];
    if (!pr || pr.workspaceId !== workspaceId) return undefined;
    return { repoId: pr.repoId, changedFiles: pr.changedFiles };
  }
}

/** Fake `RepoIntel` slice — records every call so the test can assert the
 *  facade is called exactly once with the resolved args. */
class FakeRepoIntel implements Pick<RepoIntel, 'getBlastRadius'> {
  calls: Array<{ repoId: string; changedFiles: string[] }> = [];
  constructor(private result: BlastResult) {}

  async getBlastRadius(repoId: string, changedFiles: string[]): Promise<BlastResult> {
    this.calls.push({ repoId, changedFiles });
    return this.result;
  }
}

const EMPTY_RESULT: BlastResult = {
  changedSymbols: [],
  callers: [],
  impactedEndpoints: [],
  degraded: false,
};

describe('BlastService', () => {
  it('throws NotFoundError for a PR the port does not resolve, without calling the facade', async () => {
    const repoIntel = new FakeRepoIntel(EMPTY_RESULT);
    const service = new BlastService({ source: new FakeBlastSource({}), repoIntel });

    await expect(service.build('ws-1', 'unknown-pr')).rejects.toMatchObject({ statusCode: 404 });
    expect(repoIntel.calls).toHaveLength(0);
  });

  it('throws NotFoundError for a PR that belongs to a different workspace, without calling the facade', async () => {
    const repoIntel = new FakeRepoIntel(EMPTY_RESULT);
    const source = new FakeBlastSource({ 'pr-1': { workspaceId: 'ws-owner', repoId: 'repo-1', changedFiles: ['a.ts'] } });
    const service = new BlastService({ source, repoIntel });

    await expect(service.build('ws-intruder', 'pr-1')).rejects.toMatchObject({ statusCode: 404 });
    expect(repoIntel.calls).toHaveLength(0);
  });

  it('calls the facade exactly once with the resolved repo id and changed files', async () => {
    const repoIntel = new FakeRepoIntel(EMPTY_RESULT);
    const source = new FakeBlastSource({
      'pr-1': { workspaceId: 'ws-1', repoId: 'repo-1', changedFiles: ['a.ts', 'b.ts'] },
    });
    const service = new BlastService({ source, repoIntel });

    const result = await service.build('ws-1', 'pr-1');

    expect(repoIntel.calls).toEqual([{ repoId: 'repo-1', changedFiles: ['a.ts', 'b.ts'] }]);
    expect(result.changed_symbols).toEqual([]);
    expect(result.downstream).toEqual([]);
    expect(result.degraded).toBe(false);
  });
});
