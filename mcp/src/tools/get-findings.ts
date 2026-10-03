import { z } from 'zod';
import { Severity } from '@devdigest/shared';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DevDigestApi } from '../api/port.js';
import { FINDINGS_DEFAULT_LIMIT, FINDINGS_MAX_LIMIT, shapePrFindings } from '../format/findings.js';
import { errorResult, untrustedResult } from '../format/result.js';
import { resolveRepo } from './resolve-repo.js';
import { safeHandler } from './_handler.js';
import { registerTool } from './_register.js';

interface GetFindingsArgs {
  repo: string;
  prNumber: number;
  minSeverity?: z.infer<typeof Severity>;
  limit: number;
  response_format: 'concise' | 'detailed';
}

// `.describe()` is reserved for the key params (tools/list has a token
// budget — see mcp/INSIGHTS.md and test/tools-list.test.ts); no tool `title`.
const InputSchema = z.object({
  repo: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[^\s/]+\/[^\s/]+$/, 'Expected "owner/name"')
    .describe('GitHub repo as owner/name'),
  prNumber: z.coerce.number().int().positive().describe('Pull request number'),
  minSeverity: Severity.optional().describe('Minimum severity to include'),
  limit: z.coerce.number().int().min(1).max(FINDINGS_MAX_LIMIT).default(FINDINGS_DEFAULT_LIMIT),
  response_format: z.enum(['concise', 'detailed']).default('concise').describe('concise (default) or detailed'),
});

const Counts = z.object({
  CRITICAL: z.number().int(),
  WARNING: z.number().int(),
  SUGGESTION: z.number().int(),
});

const OutputSchema = z.object({
  repo: z.string(),
  prNumber: z.number().int(),
  total_findings: z.number().int(),
  counts: Counts,
  reviews: z.array(
    z.object({
      agent_id: z.string().nullable(),
      agent_name: z.string().nullable(),
      verdict: z.string().nullable(),
      score: z.number().nullable(),
      cost_usd: z.number().nullable(),
      total_findings: z.number().int(),
      findings: z.array(
        z.object({
          id: z.string(),
          severity: z.string().describe('CRITICAL > WARNING > SUGGESTION'),
          category: z.string(),
          title: z.string(),
          file: z.string(),
          start_line: z.number().int(),
          end_line: z.number().int(),
          confidence: z.number(),
          rationale: z.string(),
          suggestion: z.string().nullish(),
        }),
      ),
      truncated: z.boolean(),
    }),
  ),
  in_progress: z.array(z.object({ agent_name: z.string().nullable() })),
  failed: z.array(z.object({ agent_name: z.string().nullable(), error: z.string().nullable() })),
  truncated: z.boolean(),
  hint: z.string().optional(),
});

const NOT_FOUND_HINT = 'Open this PR in DevDigest once so its files are imported, then retry.';

export function registerGetFindingsTool(server: McpServer, api: DevDigestApi): void {
  registerTool(
    server,
    'get_findings',
    {
      description:
        "A PR's latest review per agent: verdict, score, total_findings, findings. " +
        'Poll until in_progress is empty.',
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    safeHandler('get_findings', async (rawArgs: unknown) => {
      const args = rawArgs as GetFindingsArgs;
      const resolved = await resolveRepo(api, args.repo);
      if (!resolved.ok) return resolved.result;

      const pulls = await api.listPulls(resolved.repo.id);
      const pr = pulls.find((p) => p.number === args.prNumber);
      if (!pr || pr.id == null) {
        return errorResult(`PR #${args.prNumber} is not in DevDigest for ${args.repo}.`, [NOT_FOUND_HINT]);
      }

      const [reviews, runs] = await Promise.all([api.listPullReviews(pr.id), api.listPullRuns(pr.id)]);
      const shaped = shapePrFindings(reviews, runs, {
        repo: args.repo,
        prNumber: args.prNumber,
        format: args.response_format,
        limit: args.limit,
        ...(args.minSeverity !== undefined ? { minSeverity: args.minSeverity } : {}),
      });
      return untrustedResult(shaped);
    }),
  );
}
