import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { GenerateIntentBody, PrIntentRecord, PrIntentResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * Intent Layer (L03) module.
 *   GET  /pulls/:id/intent → the cached intent (`{intent: null}` before the first generation)
 *   POST /pulls/:id/intent → derive (or return the cached) intent; `{force:true}` bypasses the cache
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams, response: { 200: PrIntentResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const intent = await container.intentService.get(workspaceId, req.params.id);
      return { intent };
    },
  );

  app.post(
    '/pulls/:id/intent',
    {
      schema: { params: IdParams, body: GenerateIntentBody, response: { 200: PrIntentRecord } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const { record, cached } = await container.intentService.ensure(workspaceId, req.params.id, {
        force: req.body.force,
      });
      req.log.info(
        {
          prId: req.params.id,
          cached,
          confidence: record.confidence,
          model: record.model,
          costUsd: record.cost_usd,
        },
        'intent: generated',
      );
      return record;
    },
  );
}
