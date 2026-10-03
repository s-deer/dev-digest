import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DevDigestApi } from '../api/port.js';
import { okResult } from '../format/result.js';
import { safeHandler } from './_handler.js';
import { registerTool } from './_register.js';

const MAX_DESCRIPTION_CHARS = 200;

// A genuine Zod object (not a raw shape) so the emitted JSON schema is
// `{type:"object", additionalProperties:false}` for this zero-param tool.
const InputSchema = z.object({}).strict();

const OutputSchema = z.object({
  agents: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      model: z.string(),
      enabled: z.boolean(),
      skillCount: z.number().int().nonnegative(),
    }),
  ),
});

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function registerListAgentsTool(server: McpServer, api: DevDigestApi): void {
  registerTool(
    server,
    'list_agents',
    {
      description: 'List DevDigest reviewer agents (id, name, model, enabled). Use an id as agentId for run_agent_on_pr.',
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    safeHandler('list_agents', async () => {
      const agents = await api.listAgents();
      return okResult({
        agents: agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          description: truncate(agent.description, MAX_DESCRIPTION_CHARS),
          model: agent.model,
          enabled: agent.enabled,
          skillCount: agent.skill_count,
        })),
      });
    }),
  );
}
