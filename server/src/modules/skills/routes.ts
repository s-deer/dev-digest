import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Skill, SkillImportPreview, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SkillsRepository } from './repository.js';
import { IMPORT_LIMITS } from './importer.js';
import { SkillsService } from './service.js';

const SkillText = z.string().trim().min(1).max(100_000);
const CreateSkillBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2_000),
  type: SkillType,
  source: z
    .enum([SkillSource.enum.manual, SkillSource.enum.imported_file, SkillSource.enum.extracted])
    .default('manual'),
  body: SkillText,
  enabled: z.boolean().optional(),
  /** Note for the initial v1 snapshot, e.g. "Imported from foo.zip". */
  version_note: z.string().trim().min(1).max(200).optional(),
});
const UpdateSkillBody = CreateSkillBody.pick({
  name: true,
  description: true,
  type: true,
  body: true,
  enabled: true,
})
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one skill field' });
// base64 inflates the upload by ~4/3, plus room for the JSON envelope.
const IMPORT_BODY_LIMIT = Math.ceil((IMPORT_LIMITS.uploadBytes * 4) / 3) + 64 * 1024;
const ImportPreviewBody = z.object({
  filename: z.string().trim().min(1).max(255),
  content_base64: z
    .string()
    .min(1)
    .max(IMPORT_BODY_LIMIT)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/, 'Expected base64 content'),
});
const VersionParams = IdParams.extend({ version: z.coerce.number().int().positive() });
const OkResponse = z.object({ ok: z.literal(true) });

/** Reusable skill CRUD, version history, and a non-persisting .md/.zip import preview. */
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

  app.get('/skills/:id/versions', { schema: { params: IdParams, response: { 200: z.array(SkillVersion) } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: VersionParams, response: { 200: Skill } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.restore(workspaceId, req.params.id, req.params.version);
      if (result.status === 'not_found') throw new NotFoundError('Skill version not found');
      return result.skill;
    },
  );

  // Parses only; saving is a separate POST /skills after the user confirms the preview.
  app.post(
    '/skills/import-preview',
    { bodyLimit: IMPORT_BODY_LIMIT, schema: { body: ImportPreviewBody, response: { 200: SkillImportPreview } } },
    async (req) => {
      await getContext(app.container, req);
      return service.previewImport(req.body.filename, req.body.content_base64);
    },
  );

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

  app.delete('/skills/:id', { schema: { params: IdParams, response: { 200: OkResponse } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const deleted = await service.delete(workspaceId, req.params.id);
    if (!deleted) throw new NotFoundError('Skill not found');
    return { ok: true as const };
  });
}
