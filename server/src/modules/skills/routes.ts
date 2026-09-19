import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Skill, SkillImportPreview, SkillSource, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SkillsRepository } from './repository.js';
import { SkillsService } from './service.js';

const SkillText = z.string().trim().min(1).max(100_000);
const CreateSkillBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2_000),
  type: SkillType,
  source: z.enum([SkillSource.enum.manual, SkillSource.enum.extracted]).default('manual'),
  body: SkillText,
  enabled: z.boolean().optional(),
});
const UpdateSkillBody = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().min(1).max(2_000).optional(),
    type: SkillType.optional(),
    body: SkillText.optional(),
    enabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one skill field' });
const ImportPreviewBody = z.object({ markdown: SkillText });

/** Reusable skill CRUD and non-persisting Markdown import preview. */
export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(new SkillsRepository(app.container.db));

  app.get('/skills', { schema: { response: { 200: z.array(Skill) } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams, response: { 200: Skill } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills/import-preview', { schema: { body: ImportPreviewBody, response: { 200: SkillImportPreview } } }, async (req) => {
    return service.previewImport(req.body.markdown);
  });

  app.post('/skills', { schema: { body: CreateSkillBody, response: { 201: Skill } } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    reply.status(201);
    return service.create(workspaceId, req.body);
  });

  app.put('/skills/:id', { schema: { params: IdParams, body: UpdateSkillBody, response: { 200: Skill } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.update(workspaceId, req.params.id, req.body);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const deleted = await service.delete(workspaceId, req.params.id);
    if (!deleted) throw new NotFoundError('Skill not found');
    return { ok: true };
  });
}
