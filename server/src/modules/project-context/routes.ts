import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AgentProjectContext,
  ProjectContextAttachments,
  ProjectContextListing,
  ProjectContextQuery,
  ProjectDocumentRead,
  SetProjectContextBody,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { MAX_PATH_CHARS } from './constants.js';

const DocumentQuery = z.object({ path: z.string().min(1).max(MAX_PATH_CHARS) });

/**
 * Project Context module (attach repository docs to agents and skills).
 *   GET /repos/:id/project-context                   → the repo's document listing
 *   GET /repos/:id/project-context/document?path=    → one document (preview + used_by)
 *   GET|PUT /agents/:id/project-context              → an agent's attachment set for a repo (`repo_id`)
 *   GET|PUT /skills/:id/project-context              → a skill's attachment set for a repo
 * PUT replaces the whole ordered set; any path outside the listing → 422 and nothing changes.
 */
export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const putLimit = { rateLimit: { max: 30, timeWindow: '1 minute' } };

  app.get(
    '/repos/:id/project-context',
    { schema: { params: IdParams, response: { 200: ProjectContextListing } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.projectContextService.list(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/project-context/document',
    { schema: { params: IdParams, querystring: DocumentQuery, response: { 200: ProjectDocumentRead } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.projectContextService.read(workspaceId, req.params.id, req.query.path);
    },
  );

  app.get(
    '/agents/:id/project-context',
    { schema: { params: IdParams, querystring: ProjectContextQuery, response: { 200: AgentProjectContext } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.projectContextService.getAgentAttachments(workspaceId, req.params.id, req.query.repo_id);
    },
  );

  app.put(
    '/agents/:id/project-context',
    { schema: { params: IdParams, body: SetProjectContextBody, response: { 200: AgentProjectContext } }, config: putLimit },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.projectContextService.setAgentAttachments(
        workspaceId,
        req.params.id,
        req.body.repo_id,
        req.body.paths,
      );
    },
  );

  app.get(
    '/skills/:id/project-context',
    { schema: { params: IdParams, querystring: ProjectContextQuery, response: { 200: ProjectContextAttachments } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.projectContextService.getSkillAttachments(workspaceId, req.params.id, req.query.repo_id);
    },
  );

  app.put(
    '/skills/:id/project-context',
    { schema: { params: IdParams, body: SetProjectContextBody, response: { 200: ProjectContextAttachments } }, config: putLimit },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.projectContextService.setSkillAttachments(
        workspaceId,
        req.params.id,
        req.body.repo_id,
        req.body.paths,
      );
    },
  );
}
