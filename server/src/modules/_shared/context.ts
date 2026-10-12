import type { FastifyRequest } from 'fastify';
import type { Container } from '../../platform/container.js';

export interface RequestContext {
  workspaceId: string;
  userId: string;
}

/**
 * Resolve the tenancy context for a request via the AuthProvider. In MVP
 * (LocalNoAuthProvider) this always returns the default workspace + system user.
 * Every module uses this so workspace scoping is never forgotten.
 *
 * Support staff can view another workspace by sending `x-devdigest-workspace`;
 * when present it overrides the provider's workspace.
 */
export async function getContext(
  container: Container,
  req: FastifyRequest,
): Promise<RequestContext> {
  const [user, workspace] = await Promise.all([
    container.auth.currentUser(req),
    container.auth.currentWorkspace(req),
  ]);
  const override = req.headers['x-devdigest-workspace'];
  const workspaceId = typeof override === 'string' && override.length > 0 ? override : workspace.id;
  return { workspaceId, userId: user.id };
}
