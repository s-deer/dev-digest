import type { SmartDiff } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { buildSmartDiff } from './domain.js';
import type { SmartDiffInputFile, SmartDiffInputFinding } from './domain.js';

/**
 * SmartDiffService (L03): resolves a PR's files + latest review findings
 * through `SmartDiffSourcePort` and groups them with the pure `buildSmartDiff`.
 * Narrow, port-based deps (no `Container`) — modeled on `modules/intent/service.ts`.
 */

/** This PR's files + latest review findings, already workspace-scoped by the port. */
export interface SmartDiffInputs {
  files: SmartDiffInputFile[];
  findings: SmartDiffInputFinding[];
}

/**
 * Persistence port this service needs — `SmartDiffRepository` implements it.
 * A single workspace-scoped method (modeled on `IntentRepository.loadInputs`)
 * so tenancy can't be forgotten by calling `getPrFiles`/`latestReviewFindings`
 * without first checking `getPull`.
 */
export interface SmartDiffSourcePort {
  /** `undefined` when the PR isn't in this workspace. */
  loadInputs(workspaceId: string, prId: string): Promise<SmartDiffInputs | undefined>;
}

export interface SmartDiffServiceDeps {
  source: SmartDiffSourcePort;
}

export class SmartDiffService {
  constructor(private deps: SmartDiffServiceDeps) {}

  async build(workspaceId: string, prId: string): Promise<SmartDiff> {
    const inputs = await this.deps.source.loadInputs(workspaceId, prId);
    if (!inputs) throw new NotFoundError('Pull request not found');
    return buildSmartDiff(inputs.files, inputs.findings);
  }
}
