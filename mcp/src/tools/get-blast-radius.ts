import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { errorResult } from '../format/result.js';
import { safeHandler } from './_handler.js';
import { registerTool } from './_register.js';

const STUB_MESSAGE = 'get_blast_radius is not implemented yet. Use get_findings for review results.';

// Flat inline shape (no $ref) — see cross-cutting rules. Same repo regex as
// run_agent_on_pr; kept even though the handler never reaches the API, so
// the eventual real implementation slots in without a schema change. No
// tool `title` (this tool is opt-in, off the default budget — see
// mcp/INSIGHTS.md and test/tools-list.test.ts).
const InputSchema = z.object({
  repo: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[^\s/]+\/[^\s/]+$/, 'Expected "owner/name"')
    .describe('GitHub repo as owner/name'),
  prNumber: z.coerce.number().int().positive().describe('Pull request number'),
});

/**
 * Phase-3 placeholder, registered only behind `DEVDIGEST_MCP_ENABLE_BLAST_RADIUS=1`
 * (see `src/server.ts`) and always last in tool order. It never calls the
 * API — it always returns `isError` — so it has no `outputSchema` and takes
 * no `DevDigestApi` collaborator.
 */
export function registerGetBlastRadiusTool(server: McpServer): void {
  registerTool(
    server,
    'get_blast_radius',
    {
      description: "Get a PR's blast radius. Placeholder — not implemented. Always errors; use get_findings instead.",
      inputSchema: InputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    safeHandler('get_blast_radius', async () => errorResult(STUB_MESSAGE)),
  );
}
