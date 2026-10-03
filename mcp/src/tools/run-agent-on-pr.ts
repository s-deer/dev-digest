import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DevDigestApi } from '../api/port.js';
import { ApiError, type ApiErrorKind } from '../api/errors.js';
import { apiErrorResult, okResult } from '../format/result.js';
import { resolveRepo } from './resolve-repo.js';
import { safeHandler } from './_handler.js';
import { registerTool } from './_register.js';

interface RunAgentOnPrArgs {
  agentId: string;
  repo: string;
  prNumber: number;
}

// Flat inline shape (no $ref) — see cross-cutting rules. `.describe()` is
// reserved for the key params (tools/list has a token budget — see
// mcp/INSIGHTS.md and test/tools-list.test.ts); no tool `title`.
const InputSchema = z.object({
  agentId: z.string().uuid().describe('Agent id from list_agents'),
  repo: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[^\s/]+\/[^\s/]+$/, 'Expected "owner/name"')
    .describe('GitHub repo as owner/name'),
  prNumber: z.coerce.number().int().positive().describe('Pull request number'),
});

const OutputSchema = z.object({
  runId: z.string(),
  status: z.string(),
  reused: z.boolean(),
  agentName: z.string(),
  repo: z.string(),
  prNumber: z.number().int(),
  next: z.string(),
});

/** Extra, tool-specific hints layered on top of `apiErrorResult`'s generic
 *  per-kind hint (never baked into the `ApiError` message itself — see
 *  mcp/INSIGHTS.md). */
const EXTRA_HINTS: Partial<Record<ApiErrorKind, string[]>> = {
  not_found: ['Call list_agents to check the agent id, or import this PR in DevDigest first.'],
  rate_limited: ['Wait a moment before starting another run.'],
};

const NEXT_HINT = 'Call get_findings with this repo and prNumber to check progress and read results.';

export function registerRunAgentOnPrTool(server: McpServer, api: DevDigestApi): void {
  registerTool(
    server,
    'run_agent_on_pr',
    {
      description:
        'Start a review of a PR with one agent; returns runId immediately (status running). ' +
        'Reuses an already-running run. Poll get_findings(repo, prNumber) for results.',
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    safeHandler('run_agent_on_pr', async (rawArgs: unknown) => {
      const args = rawArgs as RunAgentOnPrArgs;
      const resolved = await resolveRepo(api, args.repo);
      if (!resolved.ok) return resolved.result;

      try {
        const started = await api.startRun({
          repoId: resolved.repo.id,
          prNumber: args.prNumber,
          agentId: args.agentId,
        });
        return okResult({
          runId: started.run_id,
          status: started.status,
          reused: started.reused,
          agentName: started.agent_name,
          repo: args.repo,
          prNumber: args.prNumber,
          next: NEXT_HINT,
        });
      } catch (err) {
        if (err instanceof ApiError) return apiErrorResult(err, EXTRA_HINTS[err.kind]);
        throw err;
      }
    }),
  );
}
