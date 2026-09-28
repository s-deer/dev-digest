import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { createServer } from '../src/server.js';
import { FakeDevDigestApi } from './fakes.js';

// Tool order without the flag, pinned by Phase 1–2 (`test/tools.test.ts`
// already asserts this same order for the flagless server). Phase 3 only
// adds `get_blast_radius`, always last, behind the flag.
const BASE_ORDER = ['list_agents', 'get_conventions', 'run_agent_on_pr', 'get_findings'];
const NAME_PATTERN = /^[a-z][a-z_]*$/;
const MAX_TOOLS_LIST_CHARS = 7000;
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

async function connectedClient(config: {
  apiUrl: string;
  enableBlastRadius: boolean;
  requestTimeoutMs: number;
}): Promise<{ client: Client; server: McpServer }> {
  const server = createServer({ api: new FakeDevDigestApi(), config });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' }, { capabilities: {} });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

describe('tools/list budget and shape', () => {
  let client: Client;
  let server: McpServer;

  async function connect(enableBlastRadius: boolean) {
    ({ client, server } = await connectedClient({
      apiUrl: 'http://localhost:3001',
      enableBlastRadius,
      requestTimeoutMs: 15_000,
    }));
  }

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it('lists the base tools in a fixed order, without the stub, when the flag is off', async () => {
    await connect(false);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(BASE_ORDER);
    expect(tools.find((t) => t.name === 'get_blast_radius')).toBeUndefined();
  });

  it('appends get_blast_radius last when the flag is on', async () => {
    await connect(true);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([...BASE_ORDER, 'get_blast_radius']);
  });

  it('stays within the tools/list token budget at session start (flag off)', async () => {
    // "Cheap at session start" (Phase 3 goal) means the default, flag-off
    // tools/list — `get_blast_radius` is opt-in and adds a 5th tool only
    // when a developer sets DEVDIGEST_MCP_ENABLE_BLAST_RADIUS=1. Budget
    // raised from 5000 to 7000 by user decision (see mcp/INSIGHTS.md): at
    // 5000, every tool/param description had to be stripped, which cost
    // model accuracy for ~300 tokens of savings. Measured 2026-09-27, with
    // verb-first tool descriptions and `.describe()` on key params restored:
    // 5813 chars (~1454 tokens at chars/4) for 4 tools; 6423 chars
    // (~1606 tokens) for 5 with the flag on.
    await connect(false);
    const { tools } = await client.listTools();
    const serialized = JSON.stringify(tools);
    expect(serialized.length).toBeLessThanOrEqual(MAX_TOOLS_LIST_CHARS);
  });

  it('keeps every tool description within 300 chars', async () => {
    await connect(true);
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect((tool.description ?? '').length).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS);
    }
  });

  it('never emits $schema, $defs or $ref in any tool schema', async () => {
    await connect(true);
    const { tools } = await client.listTools();
    const serialized = JSON.stringify(tools);
    expect(serialized).not.toContain('$schema');
    expect(serialized).not.toContain('$defs');
    expect(serialized).not.toContain('$ref');
  });

  it('gives list_agents a closed, additionalProperties:false input schema', async () => {
    await connect(false);
    const { tools } = await client.listTools();
    const listAgents = tools.find((t) => t.name === 'list_agents') as Tool;
    expect(listAgents.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
  });

  it('matches the read-only/destructive/idempotent/openWorld annotation matrix', async () => {
    await connect(true);
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject(ANNOTATIONS_BY_TOOL[tool.name]!);
    }
  });

  it('keeps server instructions within 600 chars', async () => {
    await connect(false);
    const instructions = client.getInstructions() ?? '';
    expect(instructions.length).toBeLessThanOrEqual(MAX_INSTRUCTIONS_CHARS);
  });

  it('names every tool in snake_case with no devdigest_ prefix', async () => {
    await connect(true);
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.name).toMatch(NAME_PATTERN);
      expect(tool.name.startsWith('devdigest_')).toBe(false);
    }
  });
});

describe('get_blast_radius stub', () => {
  let client: Client;
  let server: McpServer;

  beforeEach(async () => {
    ({ client, server } = await connectedClient({
      apiUrl: 'http://localhost:3001',
      enableBlastRadius: true,
      requestTimeoutMs: 15_000,
    }));
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it('always returns isError pointing at get_findings', async () => {
    const result = await client.callTool({
      name: 'get_blast_radius',
      arguments: { repo: 'acme/payments-api', prNumber: 482 },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0]?.text ?? '';
    expect(text).toBe('get_blast_radius is not implemented yet. Use get_findings for review results.');
  });
});
