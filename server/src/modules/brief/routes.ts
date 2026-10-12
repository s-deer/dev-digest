import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBriefResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BRIEF_RATE_LIMIT } from './constants.js';

/**
 * PR Brief (L05) module.
 *   GET  /pulls/:id/brief → the stored brief + `stale` (never calls the model)
 *   POST /pulls/:id/brief → generate (or regenerate) the brief: one model call, rate limited
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBriefResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.briefService.get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/brief',
    {
      schema: { params: IdParams, response: { 200: PrBriefResponse } },
      config: { rateLimit: BRIEF_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.briefService.generate(workspaceId, req.params.id, {
        onFinish: (line) => req.log.info(line, 'brief: generated'),
      });
    },
  );
}
