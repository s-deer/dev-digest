import { z } from 'zod';
import type { ConventionStatus } from '@devdigest/shared';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DevDigestApi } from '../api/port.js';
import {
  CONVENTIONS_DEFAULT_LIMIT,
  CONVENTIONS_MAX_LIMIT,
  shapeConventions,
} from '../format/conventions.js';
import { untrustedResult } from '../format/result.js';
import { resolveRepo } from './resolve-repo.js';
import { safeHandler } from './_handler.js';
import { registerTool } from './_register.js';

const StatusFilter = z.enum(['accepted', 'pending', 'all']);

interface GetConventionsArgs {
  repo: string;
  status: z.infer<typeof StatusFilter>;
  limit: number;
  response_format: 'concise' | 'detailed';
}

// Flat inline shape (no $ref) — see cross-cutting rules. `.describe()` is
// reserved for the key params (tools/list has a token budget — see
// mcp/INSIGHTS.md and test/tools-list.test.ts); no tool `title`.
const InputSchema = z.object({
  repo: z.string().min(1).max(200).describe('GitHub repo as owner/name'),
  status: StatusFilter.default('accepted'),
  limit: z.coerce.number().int().min(1).max(CONVENTIONS_MAX_LIMIT).default(CONVENTIONS_DEFAULT_LIMIT),
  response_format: z.enum(['concise', 'detailed']).default('concise').describe('concise (default) or detailed'),
});

const OutputSchema = z.object({
  repo_id: z.string(),
  counts: z.object({
    pending: z.number().int().nonnegative(),
    accepted: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
  }),
  conventions: z.array(
    z.object({
      id: z.string(),
      category: z.string(),
      rule: z.string(),
      status: z.string(),
      confidence: z.number(),
      evidence_path: z.string(),
      rationale: z.string().nullish(),
      evidence_line: z.number().nullish(),
      evidence_snippet: z.string().optional(),
    }),
  ),
  total_matched: z.number().int().nonnegative(),
  truncated: z.boolean(),
});

function statusesFor(status: z.infer<typeof StatusFilter>): ConventionStatus[] {
  return status === 'all' ? ['pending', 'accepted', 'rejected'] : [status];
}

export function registerGetConventionsTool(server: McpServer, api: DevDigestApi): void {
  registerTool(
    server,
    'get_conventions',
    {
      description:
        'Get coding conventions DevDigest extracted for a repo (owner/name); accepted by default. Does not run a new scan.',
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    safeHandler('get_conventions', async (rawArgs: unknown) => {
      const args = rawArgs as GetConventionsArgs;
      const resolved = await resolveRepo(api, args.repo);
      if (!resolved.ok) return resolved.result;

      const state = await api.getConventions(resolved.repo.id, statusesFor(args.status));
      const shaped = shapeConventions(resolved.repo.id, state, {
        format: args.response_format,
        limit: args.limit,
      });
      return untrustedResult(shaped);
    }),
  );
}
