import { z } from 'zod';
import { Severity } from '@devdigest/shared';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DevDigestApi } from '../api/port.js';
import { FINDINGS_DEFAULT_LIMIT, FINDINGS_MAX_LIMIT, shapeFindings } from '../format/findings.js';
import { untrustedResult } from '../format/result.js';
import { safeHandler } from './_handler.js';
import { registerTool } from './_register.js';

interface GetFindingsArgs {
  runId: string;
  minSeverity?: z.infer<typeof Severity>;
  limit: number;
  cursor?: number;
  response_format: 'concise' | 'detailed';
}

// `.describe()` is reserved for the key params (tools/list has a token
// budget — see mcp/INSIGHTS.md and test/tools-list.test.ts); no tool `title`.
const InputSchema = z.object({
  runId: z.string().uuid().describe('runId from run_agent_on_pr'),
  minSeverity: Severity.optional().describe('Only findings at least this severe (CRITICAL is most severe)'),
  limit: z.coerce.number().int().min(1).max(FINDINGS_MAX_LIMIT).default(FINDINGS_DEFAULT_LIMIT),
  cursor: z.coerce.number().int().min(0).optional().describe('nextCursor from a previous call'),
  response_format: z.enum(['concise', 'detailed']).default('concise').describe('concise (default) or detailed'),
});

const OutputSchema = z.object({
  run_id: z.string(),
  status: z.string(),
  cost_usd: z.number().nullable(),
  verdict: z.string().nullable(),
  counts: z.object({
    CRITICAL: z.number().int(),
    WARNING: z.number().int(),
    SUGGESTION: z.number().int(),
  }),
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
  next_cursor: z.number().int().nullable(),
  truncated: z.boolean(),
  hint: z.string().optional(),
});

export function registerGetFindingsTool(server: McpServer, api: DevDigestApi): void {
  registerTool(
    server,
    'get_findings',
    {
      description:
        "Get a review run's status, cost, verdict and findings by runId. While status is running, call again " +
        'in ~15s. Narrow with minSeverity/limit/cursor.',
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    safeHandler('get_findings', async (rawArgs: unknown) => {
      const args = rawArgs as GetFindingsArgs;
      const detail = await api.getRun(args.runId);
      const shaped = shapeFindings(detail, {
        format: args.response_format,
        limit: args.limit,
        ...(args.minSeverity !== undefined ? { minSeverity: args.minSeverity } : {}),
        ...(args.cursor !== undefined ? { cursor: args.cursor } : {}),
      });
      return untrustedResult(shaped);
    }),
  );
}
