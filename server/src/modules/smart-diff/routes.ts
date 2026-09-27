import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SmartDiffResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * Smart Diff (L03) module.
 *   GET /pulls/:id/smart-diff → the PR's files grouped by role, with the
 *   latest review's (non-dismissed) findings attached — no LLM call.
 */
export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/pulls/:id/smart-diff',
    { schema: { params: IdParams, response: { 200: SmartDiffResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const smartDiff = await container.smartDiffService.build(workspaceId, req.params.id);
      const files = smartDiff.groups.reduce((sum, group) => sum + group.files.length, 0);
      const findingFiles = smartDiff.groups.reduce(
        (sum, group) => sum + group.files.filter((file) => file.finding_lines.length > 0).length,
        0,
      );
      req.log.info(
        { prId: req.params.id, files, groups: smartDiff.groups.length, findingFiles, llm: false },
        'smart-diff: built',
      );
      return smartDiff;
    },
  );
}
