import type { BlastRadiusResponse } from '@devdigest/shared';
import type { RepoIntel } from '../repo-intel/types.js';
import { NotFoundError } from '../../platform/errors.js';
import { toBlastRadius } from './domain.js';

/**
 * BlastService (L04): resolves a PR's repo id + changed files through
 * `BlastSourcePort`, calls the repo-intel facade exactly once, and maps the
 * result with the pure `toBlastRadius`. Narrow, port-based deps (no
 * `Container`) — modeled on `modules/smart-diff/service.ts`.
 */

/** This PR's scope for the facade call, already workspace-scoped by the port. */
export interface BlastScope {
  repoId: string;
  changedFiles: string[];
}

/**
 * Persistence port this service needs — `BlastRepository` implements it.
 * A single workspace-scoped method (modeled on `SmartDiffSourcePort.loadInputs`)
 * so tenancy can't be forgotten by resolving the repo/files without first
 * checking the PR belongs to this workspace.
 */
export interface BlastSourcePort {
  /** `undefined` when the PR isn't in this workspace. */
  loadScope(workspaceId: string, prId: string): Promise<BlastScope | undefined>;
}

export interface BlastServiceDeps {
  source: BlastSourcePort;
  repoIntel: Pick<RepoIntel, 'getBlastRadius'>;
}

export class BlastService {
  constructor(private deps: BlastServiceDeps) {}

  async build(workspaceId: string, prId: string): Promise<BlastRadiusResponse> {
    const scope = await this.deps.source.loadScope(workspaceId, prId);
    if (!scope) throw new NotFoundError('Pull request not found');
    const result = await this.deps.repoIntel.getBlastRadius(scope.repoId, scope.changedFiles);
    return toBlastRadius(result);
  }
}
