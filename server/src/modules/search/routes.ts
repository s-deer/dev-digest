import type { FastifyInstance } from 'fastify';
import { getContext } from '../_shared/context.js';
import { SearchRepository } from './repository.js';

/**
 * Search module. Free-text search across pull requests in the current
 * workspace.
 *   GET /search/pulls?q=&page= → matching PRs (title/body), newest first
 */
export default async function searchRoutes(app: FastifyInstance) {
  const repo = new SearchRepository(app.container.db);

  app.get('/search/pulls', async (req: any) => {
    const { workspaceId } = await getContext(app.container, req);
    const q = req.query.q;
    const page = req.query.page ? parseInt(req.query.page) : 1;
    const pageSize = 20;
    return repo.searchPulls(workspaceId, q, page, pageSize);
  });
}
