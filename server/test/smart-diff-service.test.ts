import { describe, it, expect } from 'vitest';
import { SmartDiffService } from '../src/modules/smart-diff/service.js';
import type { SmartDiffInputFile, SmartDiffInputFinding } from '../src/modules/smart-diff/domain.js';
import type { SmartDiffInputs, SmartDiffSourcePort } from '../src/modules/smart-diff/service.js';

/** Fake `SmartDiffSourcePort` — hermetic, no Db, no Docker. Keyed by
 *  `prId`, so a PR absent from `pulls` (or resolved under a different
 *  workspace) behaves exactly like tenancy scoping would. */
class FakeSmartDiffSource implements SmartDiffSourcePort {
  constructor(
    private pulls: Record<string, { workspaceId: string }>,
    private files: SmartDiffInputFile[] = [],
    private findings: SmartDiffInputFinding[] = [],
  ) {}

  async loadInputs(workspaceId: string, prId: string): Promise<SmartDiffInputs | undefined> {
    const pull = this.pulls[prId];
    if (!pull || pull.workspaceId !== workspaceId) return undefined;
    return { files: this.files, findings: this.findings };
  }
}

describe('SmartDiffService', () => {
  it('throws NotFoundError for a PR the port does not resolve', async () => {
    const service = new SmartDiffService({ source: new FakeSmartDiffSource({}) });
    await expect(service.build('ws-1', 'unknown-pr')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws NotFoundError for a PR that belongs to a different workspace', async () => {
    const source = new FakeSmartDiffSource({ 'pr-1': { workspaceId: 'ws-owner' } });
    const service = new SmartDiffService({ source });
    await expect(service.build('ws-intruder', 'pr-1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns groups with empty finding_lines when there is no review yet', async () => {
    const files: SmartDiffInputFile[] = [
      { path: 'src/config.ts', additions: 4, deletions: 0 },
      { path: 'pnpm-lock.yaml', additions: 10, deletions: 0 },
    ];
    const source = new FakeSmartDiffSource({ 'pr-1': { workspaceId: 'ws-1' } }, files, []);
    const service = new SmartDiffService({ source });

    const result = await service.build('ws-1', 'pr-1');

    expect(result.groups.length).toBeGreaterThan(0);
    for (const group of result.groups) {
      for (const file of group.files) {
        expect(file.finding_lines).toEqual([]);
      }
    }
  });
});
