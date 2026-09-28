import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { createServer } from '../src/server.js';
import { buildBlastRadiusResponse, buildPrMeta, buildRepo, FakeDevDigestApi } from './fakes.js';

// Fixed tool order, pinned since Phase 1–2 (`test/tools.test.ts` asserts the
// same order). `get_blast_radius` is now a real tool, always registered last
// (Phase 3, S14 — the flag was removed by user decision; see mcp/README.md).
const TOOL_ORDER = ['list_agents', 'get_conventions', 'run_agent_on_pr', 'get_findings', 'get_blast_radius'];
const NAME_PATTERN = /^[a-z][a-z_]*$/;
// Measured 2026-09-28 with all 5 tools always registered: 7313 chars
// (~1828 tokens at chars/4) — see mcp/INSIGHTS.md. Budget raised from the
// prior flag-off 7000-char ceiling to 8000 (measured + a small margin), since
// get_blast_radius is no longer optional.
const MAX_TOOLS_LIST_CHARS = 8000;
const MAX_DESCRIPTION_CHARS = 300;
const MAX_INSTRUCTIONS_CHARS = 600;

const READ_ONLY_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const ANNOTATIONS_BY_TOOL: Record<string, typeof READ_ONLY_ANNOTATIONS | Record<string, boolean>> = {
  list_agents: READ_ONLY_ANNOTATIONS,
  get_conventions: READ_ONLY_ANNOTATIONS,
  get_findings: READ_ONLY_ANNOTATIONS,
  get_blast_radius: READ_ONLY_ANNOTATIONS,
  run_agent_on_pr: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
};

async function connectedClient(api: FakeDevDigestApi = new FakeDevDigestApi()): Promise<{ client: Client; server: McpServer }> {
  const server = createServer({ api, config: { apiUrl: 'http://localhost:3001', requestTimeoutMs: 15_000 } });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' }, { capabilities: {} });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

describe('tools/list budget and shape', () => {
  let client: Client;
  let server: McpServer;

  beforeEach(async () => {
    ({ client, server } = await connectedClient());
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it('lists all five tools in a fixed order', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(TOOL_ORDER);
  });

  it('stays within the tools/list token budget at session start', async () => {
    // Budget raised from 7000 to 8000 because get_blast_radius is now always
    // registered — there is no flag-off, cheaper tools/list anymore. See
    // mcp/INSIGHTS.md for the measured size and the reasoning.
    const { tools } = await client.listTools();
    const serialized = JSON.stringify(tools);
    expect(serialized.length).toBeLessThanOrEqual(MAX_TOOLS_LIST_CHARS);
  });

  it('keeps every tool description within 300 chars', async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect((tool.description ?? '').length).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS);
    }
  });

  it('never emits $schema, $defs or $ref in any tool schema', async () => {
    const { tools } = await client.listTools();
    const serialized = JSON.stringify(tools);
    expect(serialized).not.toContain('$schema');
    expect(serialized).not.toContain('$defs');
    expect(serialized).not.toContain('$ref');
  });

  it('gives list_agents a closed, additionalProperties:false input schema', async () => {
    const { tools } = await client.listTools();
    const listAgents = tools.find((t) => t.name === 'list_agents') as Tool;
    expect(listAgents.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
  });

  it('matches the read-only/destructive/idempotent/openWorld annotation matrix', async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject(ANNOTATIONS_BY_TOOL[tool.name]!);
    }
  });

  it('keeps server instructions within 600 chars', async () => {
    const instructions = client.getInstructions() ?? '';
    expect(instructions.length).toBeLessThanOrEqual(MAX_INSTRUCTIONS_CHARS);
  });

  it('names every tool in snake_case with no devdigest_ prefix', async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.name).toMatch(NAME_PATTERN);
      expect(tool.name.startsWith('devdigest_')).toBe(false);
    }
  });
});

describe('get_blast_radius', () => {
  let api: FakeDevDigestApi;
  let client: Client;
  let server: McpServer;

  beforeEach(async () => {
    api = new FakeDevDigestApi();
    ({ client, server } = await connectedClient(api));
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it('is a real tool with an outputSchema and returns structured content', async () => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === 'get_blast_radius') as Tool;
    expect(tool.outputSchema).toBeDefined();

    api.repos = [buildRepo({ id: 'r1', full_name: 'acme/payments-api' })];
    api.pullsByRepoId.set('r1', [buildPrMeta({ id: 'pr-1', number: 482 })]);
    api.blastByPrId.set('pr-1', buildBlastRadiusResponse());

    const result = await client.callTool({
      name: 'get_blast_radius',
      arguments: { repo: 'acme/payments-api', prNumber: 482 },
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeDefined();
  });
});
