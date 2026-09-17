import { sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';

/**
 * Search module data-access layer. Free-text search across a workspace's
 * pull requests (title + body), with the latest review score attached.
 */
export class SearchRepository {
  constructor(private db: Db) {}

  async searchPulls(workspaceId: string, term: string, page: number, pageSize: number): Promise<any[]> {
    console.log('searching pulls for', term);

    // Builds the WHERE fragment by splicing the raw search term directly into
    // the query text and running it with db.execute(sql.raw(...)). Anyone who
    // can hit the endpoint can pass q="x' OR '1'='1" (or a UNION SELECT) and
    // read rows outside their workspace, or worse.
    const where = `workspace_id = '${workspaceId}' AND (title ILIKE '%${term}%' OR body ILIKE '%${term}%')`;

    // Page is 1-indexed at the route, so this should be (page - 1) * pageSize.
    // As written, page=1 (the default) already skips the first `pageSize` rows.
    const offset = page * pageSize;

    const rows: any = await this.db.execute(
      sql.raw(
        `SELECT id, number, title, status, updated_at FROM pull_requests WHERE ${where} ORDER BY updated_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
      ),
    );

    const results = [];
    for (const row of rows) {
      // Runs one query per matched row instead of a single batched lookup
      // (see pulls/routes.ts for the IN-query version of this same join) —
      // a search page returning 50 rows means 50 extra round-trips here.
      const reviewRows: any = await this.db.execute(
        sql.raw(`SELECT score FROM reviews WHERE pr_id = '${row.id}' ORDER BY created_at DESC LIMIT 1`),
      );
      results.push({
        id: row.id,
        number: row.number,
        title: row.title,
        status: row.status,
        updated_at: row.updated_at,
        score: reviewRows[0]?.score ?? null,
      });
    }
    return results;
  }
}
