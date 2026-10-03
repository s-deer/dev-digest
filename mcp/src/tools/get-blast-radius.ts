import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DevDigestApi } from '../api/port.js';
import { ApiError, type ApiErrorKind } from '../api/errors.js';
import { formatBlast } from '../format/blast.js';
import { apiErrorResult, errorResult, untrustedResult } from '../format/result.js';
import { resolveRepo } from './resolve-repo.js';
import { safeHandler } from './_handler.js';
import { registerTool } from './_register.js';

interface GetBlastRadiusArgs {
  repo: string;
  prNumber: number;
}

// Flat inline shape (no $ref) — see cross-cutting rules. Same repo regex as
// run_agent_on_pr. `.describe()` is reserved for the key params (tools/list
// has a token budget — see mcp/INSIGHTS.md and test/tools-list.test.ts); no
// tool `title`.
const InputSchema = z.object({
  repo: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[^\s/]+\/[^\s/]+$/, 'Expected "owner/name"')
    .describe('GitHub repo as owner/name'),
  prNumber: z.coerce.number().int().positive().describe('Pull request number'),
});

const OutputSchema = z.object({
  repo: z.string(),
  prNumber: z.number().int(),
  summary: z.string(),
  degraded: z.boolean(),
  reason: z.string().nullable(),
  changedSymbols: z.array(z.string()),
  downstream: z.array(
    z.object({
      symbol: z.string(),
      callers: z.array(z.string()).describe('"file:line name"'),
      endpoints: z.array(z.string()),
      crons: z.array(z.string()),
    }),
  ),
  hint: z.string().optional(),
});

const NOT_FOUND_HINT = 'Open this PR in DevDigest once so its files are imported, then retry.';

/** Extra, tool-specific hints layered on top of `apiErrorResult`'s generic
 *  per-kind hint (never baked into the `ApiError` message itself — see
 *  mcp/INSIGHTS.md). */
const EXTRA_HINTS: Partial<Record<ApiErrorKind, string[]>> = {
  not_found: [NOT_FOUND_HINT],
};

/**
 * A PR's changed symbols, their callers, and the endpoints/crons they reach
 * — read straight from the repo-intel index, no LLM call. Always registered
 * (no flag — see mcp/README.md).
 */
export function registerGetBlastRadiusTool(server: McpServer, api: DevDigestApi): void {
  registerTool(
    server,
    'get_blast_radius',
    {
      description:
        "Get a PR's blast radius: changed symbols, their callers (file:line), and the endpoints/crons they " +
        'reach. Read-only, no LLM call. The PR must already be imported in DevDigest; use get_findings for review results.',
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    safeHandler('get_blast_radius', async (rawArgs: unknown) => {
      const args = rawArgs as GetBlastRadiusArgs;
      const resolved = await resolveRepo(api, args.repo);
      if (!resolved.ok) return resolved.result;

      const pulls = await api.listPulls(resolved.repo.id);
      const pr = pulls.find((p) => p.number === args.prNumber);
      if (!pr || pr.id == null) {
        return errorResult(`PR #${args.prNumber} is not in DevDigest for ${args.repo}.`, [NOT_FOUND_HINT]);
      }

      try {
        const blast = await api.getBlastRadius(pr.id);
        return untrustedResult(formatBlast(blast, { repo: args.repo, prNumber: args.prNumber }));
      } catch (err) {
        if (err instanceof ApiError) return apiErrorResult(err, EXTRA_HINTS[err.kind]);
        throw err;
      }
    }),
  );
}
