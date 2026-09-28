import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BlastRadiusResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { countBlast } from './domain.js';

/**
 * Blast radius (L04) module.
 *   GET /pulls/:id/blast → the PR's changed symbols, their callers (grouped),
 *   and the HTTP endpoints/crons they reach — read straight from the
 *   repo-intel index, no LLM call, no re-parse.
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: BlastRadiusResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const blast = await container.blastService.build(workspaceId, req.params.id);
      const counts = countBlast(blast.changed_symbols, blast.downstream);
      req.log.info(
        {
          prId: req.params.id,
          ...counts,
          degraded: blast.degraded,
          reason: blast.reason,
          source: blast.degraded ? 'fallback' : 'index',
          llm: false,
        },
        'blast: built',
      );
      return blast;
    },
  );
}
