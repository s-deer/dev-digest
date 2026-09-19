import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ConventionCandidate,
  ConventionExtractResult,
  ConventionSkillDraft,
  ConventionStatus,
  ConventionsState,
  CreateConventionSkillBody,
  Skill,
  UpdateConventionBody,
} from '@devdigest/shared';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ConventionsRepository, ConventionsUnitOfWork } from './repository.js';
import { ConventionsService } from './service.js';

const RepoParams = z.object({ id: z.string().uuid() });
const StatusQuery = z.object({
  status: z.string().regex(/^(pending|accepted|rejected)(,(pending|accepted|rejected))*$/).optional(),
});
const DraftBody = z.object({ convention_ids: z.array(z.string().uuid()) });

function statuses(value?: string) {
  return (value ? value.split(',') : ['pending', 'accepted']) as z.infer<typeof ConventionStatus>[];
}

function serviceFor(app: FastifyInstance): ConventionsService {
  return new ConventionsService({
    conventions: new ConventionsRepository(app.container.db),
    skillWriter: new ConventionsUnitOfWork(app.container.db, app.container.skillsRepo, app.container.agentsRepo),
    repos: app.container.reposRepo,
    skills: app.container.skillsRepo,
    agents: app.container.agentsRepo,
    repoIntel: app.container.repoIntel,
    git: app.container.git,
    resolveModel: (workspaceId) => resolveFeatureModel(app.container, workspaceId, 'conventions'),
    llm: (provider) => app.container.llm(provider),
  });
}

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = serviceFor(app);

  app.get(
    '/repos/:id/conventions',
    { schema: { params: RepoParams, querystring: StatusQuery, response: { 200: ConventionsState } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.list(workspaceId, req.params.id, statuses(req.query.status));
    },
  );

  app.post(
    '/repos/:id/conventions/extract',
    {
      schema: { params: RepoParams, response: { 200: ConventionExtractResult } },
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.extract(workspaceId, req.params.id);
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionBody, response: { 200: ConventionCandidate } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const updated = await service.update(workspaceId, req.params.id, req.body);
      if (!updated) throw new NotFoundError('Convention not found');
      return updated;
    },
  );

  app.post(
    '/repos/:id/conventions/skill-draft',
    { schema: { params: RepoParams, body: DraftBody, response: { 200: ConventionSkillDraft } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.draft(workspaceId, req.params.id, req.body.convention_ids);
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: RepoParams, body: CreateConventionSkillBody, response: { 201: Skill } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.createSkill(workspaceId, req.params.id, req.body);
      reply.status(201);
      return skill;
    },
  );
}

export { serviceFor };
