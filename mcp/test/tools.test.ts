import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createServer } from '../src/server.js';
import { ApiError } from '../src/api/errors.js';
import {
  buildAgent,
  buildBlastRadiusResponse,
  buildFinding,
  buildPrMeta,
  buildRepo,
  buildRunDetail,
  buildStartRunResponse,
  FakeDevDigestApi,
} from './fakes.js';

const config = { apiUrl: 'http://localhost:3001', requestTimeoutMs: 15_000 };

// `agentId`/`runId` are validated as uuids by the tool input schemas.
const AGENT_ID = '11111111-1111-1111-1111-111111111111';
const RUN_1 = '22222222-2222-2222-2222-222222222222';
const RUN_RUNNING = '33333333-3333-3333-3333-333333333333';
const RUN_FAILED = '44444444-4444-4444-4444-444444444444';
const RUN_MISSING = '55555555-5555-5555-5555-555555555555';

async function connectedClient(api: FakeDevDigestApi): Promise<{ client: Client; server: McpServer }> {
  const server = createServer({ api, config });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' }, { capabilities: {} });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

describe('devdigest mcp tools', () => {
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

  it('lists all five tools in order', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      'list_agents',
      'get_conventions',
      'run_agent_on_pr',
      'get_findings',
      'get_blast_radius',
    ]);
  });

  describe('list_agents', () => {
    it('returns agents shaped for the client', async () => {
      api.agents = [buildAgent({ id: 'a1', name: 'Reviewer' })];
      const result = await client.callTool({ name: 'list_agents', arguments: {} });
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toEqual({
        agents: [
          {
            id: 'a1',
            name: 'Reviewer',
            description: 'Reviews pull requests',
            provider: 'openai',
            model: 'gpt-5',
            enabled: true,
            skillCount: 0,
          },
        ],
      });
    });

    it('never leaks system_prompt', async () => {
      api.agents = [buildAgent()];
      const result = await client.callTool({ name: 'list_agents', arguments: {} });
      expect(JSON.stringify(result.structuredContent)).not.toContain('system_prompt');
    });

    it('gives isError with the dev.sh hint when the API is unreachable', async () => {
      api.failWith = new ApiError('unreachable', 'DevDigest API is not reachable at http://localhost:3001.');
      const result = await client.callTool({ name: 'list_agents', arguments: {} });
      expect(result.isError).toBe(true);
      expect((result.content as Array<{ text: string }>)[0]?.text).toMatch(/scripts\/dev\.sh/);
    });
  });

  describe('get_conventions', () => {
    it('returns accepted conventions by default, fenced as untrusted', async () => {
      const repo = buildRepo({ id: 'r1', full_name: 'acme/payments-api' });
      api.repos = [repo];
      api.conventionsByRepoId.set('r1', {
        last_scan: null,
        counts: { pending: 1, accepted: 1, rejected: 0 },
        candidates: [
          {
            id: 'c1',
            repo_id: 'r1',
            scan_id: null,
            category: 'naming',
            rule: 'Use camelCase',
            rationale: 'Consistency',
            evidence_path: 'src/index.ts',
            evidence_line: 1,
            evidence_snippet: 'const x = 1;',
            confidence: 0.8,
            status: 'accepted',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'c2',
            repo_id: 'r1',
            scan_id: null,
            category: 'naming',
            rule: 'Pending rule',
            rationale: null,
            evidence_path: 'src/index.ts',
            evidence_line: 2,
            evidence_snippet: 'const y = 2;',
            confidence: 0.5,
            status: 'pending',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      });

      const result = await client.callTool({ name: 'get_conventions', arguments: { repo: 'acme/payments-api' } });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ text: string }>)[0]?.text ?? '';
      expect(text.startsWith('<untrusted_data>')).toBe(true);
      const structured = result.structuredContent as { conventions: Array<{ id: string }> };
      expect(structured.conventions.map((c) => c.id)).toEqual(['c1']);
    });

    it('gives isError listing imported repos for an unknown repo', async () => {
      api.repos = [buildRepo({ full_name: 'acme/known-repo' })];
      const result = await client.callTool({ name: 'get_conventions', arguments: { repo: 'acme/unknown' } });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ text: string }>)[0]?.text ?? '';
      expect(text).toContain('acme/known-repo');
    });

    it('never leaks clone_path', async () => {
      const repo = buildRepo({ id: 'r1', full_name: 'acme/payments-api', clone_path: '/secret/path' });
      api.repos = [repo];
      api.conventionsByRepoId.set('r1', {
        last_scan: null,
        counts: { pending: 0, accepted: 0, rejected: 0 },
        candidates: [],
      });
      const result = await client.callTool({ name: 'get_conventions', arguments: { repo: 'acme/payments-api' } });
      expect(JSON.stringify(result.structuredContent)).not.toContain('/secret/path');
    });

    it('gives isError with the dev.sh hint when the API is unreachable', async () => {
      api.failWith = new ApiError('unreachable', 'DevDigest API is not reachable at http://localhost:3001.');
      const result = await client.callTool({ name: 'get_conventions', arguments: { repo: 'acme/payments-api' } });
      expect(result.isError).toBe(true);
      expect((result.content as Array<{ text: string }>)[0]?.text).toMatch(/scripts\/dev\.sh/);
    });
  });

  describe('run_agent_on_pr', () => {
    it('starts a run and returns runId/status/reused/agentName/next', async () => {
      api.repos = [buildRepo({ id: 'r1', full_name: 'acme/payments-api' })];
      api.startRunResponse = buildStartRunResponse({ run_id: 'run-42', reused: false, agent_name: 'Reviewer' });

      const result = await client.callTool({
        name: 'run_agent_on_pr',
        arguments: { agentId: AGENT_ID, repo: 'acme/payments-api', prNumber: 482 },
      });

      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toEqual({
        runId: 'run-42',
        status: 'running',
        reused: false,
        agentName: 'Reviewer',
        repo: 'acme/payments-api',
        prNumber: 482,
        next: 'Call get_findings with this runId to check progress and read results.',
      });
    });

    it('passes reused:true through when the server reused an in-flight run', async () => {
      api.repos = [buildRepo({ id: 'r1', full_name: 'acme/payments-api' })];
      api.startRunResponse = buildStartRunResponse({ run_id: 'run-existing', reused: true });

      const result = await client.callTool({
        name: 'run_agent_on_pr',
        arguments: { agentId: AGENT_ID, repo: 'acme/payments-api', prNumber: 482 },
      });

      expect((result.structuredContent as { reused: boolean }).reused).toBe(true);
    });

    it('gives isError listing imported repos for an unknown repo', async () => {
      api.repos = [buildRepo({ full_name: 'acme/known-repo' })];
      const result = await client.callTool({
        name: 'run_agent_on_pr',
        arguments: { agentId: AGENT_ID, repo: 'acme/unknown', prNumber: 1 },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ text: string }>)[0]?.text ?? '';
      expect(text).toContain('acme/known-repo');
    });

    it('adds the not_found hint (list_agents / import the PR) on top of the generic one', async () => {
      api.repos = [buildRepo({ id: 'r1', full_name: 'acme/payments-api' })];
      // `startRunFailWith` (not `failWith`) so resolveRepo's listRepos() still
      // succeeds and only the startRun call itself fails.
      api.startRunFailWith = new ApiError('not_found', 'Pull request not found');
      const result = await client.callTool({
        name: 'run_agent_on_pr',
        arguments: { agentId: AGENT_ID, repo: 'acme/payments-api', prNumber: 482 },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ text: string }>)[0]?.text ?? '';
      expect(text).toContain('import this PR');
    });

    it('adds the rate_limited "wait" hint', async () => {
      api.repos = [buildRepo({ id: 'r1', full_name: 'acme/payments-api' })];
      api.startRunFailWith = new ApiError('rate_limited', 'Too many requests');
      const result = await client.callTool({
        name: 'run_agent_on_pr',
        arguments: { agentId: AGENT_ID, repo: 'acme/payments-api', prNumber: 482 },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ text: string }>)[0]?.text ?? '';
      expect(text).toContain('Wait a moment');
    });
  });

  describe('get_findings', () => {
    it('returns status/cost/verdict/counts/findings, fenced as untrusted', async () => {
      api.runsById.set(
        RUN_1,
        buildRunDetail({
          run_id: RUN_1,
          findings: [buildFinding({ id: 'f1', severity: 'CRITICAL' }), buildFinding({ id: 'f2', severity: 'WARNING' })],
        }),
      );

      const result = await client.callTool({ name: 'get_findings', arguments: { runId: RUN_1 } });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ text: string }>)[0]?.text ?? '';
      expect(text.startsWith('<untrusted_data>')).toBe(true);
      const structured = result.structuredContent as { findings: Array<{ id: string }>; counts: Record<string, number> };
      expect(structured.findings.map((f) => f.id)).toEqual(['f1', 'f2']);
      expect(structured.counts).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 0 });
    });

    it('filters by minSeverity and pages with limit/cursor', async () => {
      api.runsById.set(
        RUN_1,
        buildRunDetail({
          run_id: RUN_1,
          findings: [
            buildFinding({ id: 'c1', severity: 'CRITICAL' }),
            buildFinding({ id: 'w1', severity: 'WARNING' }),
            buildFinding({ id: 's1', severity: 'SUGGESTION' }),
          ],
        }),
      );

      const filtered = await client.callTool({
        name: 'get_findings',
        arguments: { runId: RUN_1, minSeverity: 'WARNING' },
      });
      const filteredIds = (filtered.structuredContent as { findings: Array<{ id: string }> }).findings.map(
        (f) => f.id,
      );
      expect(filteredIds).toEqual(['c1', 'w1']);

      const page1 = await client.callTool({ name: 'get_findings', arguments: { runId: RUN_1, limit: 1 } });
      const page1Body = page1.structuredContent as { findings: Array<{ id: string }>; next_cursor: number | null };
      expect(page1Body.findings.map((f) => f.id)).toEqual(['c1']);
      expect(page1Body.next_cursor).toBe(1);

      const page2 = await client.callTool({
        name: 'get_findings',
        arguments: { runId: RUN_1, limit: 1, cursor: page1Body.next_cursor! },
      });
      const page2Body = page2.structuredContent as { findings: Array<{ id: string }>; next_cursor: number | null };
      expect(page2Body.findings.map((f) => f.id)).toEqual(['w1']);
    });

    it('hints to retry while running, and surfaces the error while failed', async () => {
      api.runsById.set(RUN_RUNNING, buildRunDetail({ run_id: RUN_RUNNING, status: 'running', findings: [] }));
      const running = await client.callTool({ name: 'get_findings', arguments: { runId: RUN_RUNNING } });
      expect((running.structuredContent as { hint?: string }).hint).toMatch(/~15s/);

      api.runsById.set(
        RUN_FAILED,
        buildRunDetail({ run_id: RUN_FAILED, status: 'failed', error: 'provider timed out', findings: [] }),
      );
      const failed = await client.callTool({ name: 'get_findings', arguments: { runId: RUN_FAILED } });
      const hint = (failed.structuredContent as { hint?: string }).hint ?? '';
      expect(hint).toContain('provider timed out');
      expect(hint).toContain('provider key');
    });

    it('gives isError for an unknown run', async () => {
      const result = await client.callTool({ name: 'get_findings', arguments: { runId: RUN_MISSING } });
      expect(result.isError).toBe(true);
    });
  });

  describe('get_blast_radius', () => {
    it('returns the formatted blast radius, fenced as untrusted, and calls the API once with the resolved PR id', async () => {
      api.repos = [buildRepo({ id: 'r1', full_name: 'acme/payments-api' })];
      api.pullsByRepoId.set('r1', [buildPrMeta({ id: 'pr-1', number: 482 })]);
      api.blastByPrId.set('pr-1', buildBlastRadiusResponse());

      const result = await client.callTool({
        name: 'get_blast_radius',
        arguments: { repo: 'acme/payments-api', prNumber: 482 },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ text: string }>)[0]?.text ?? '';
      expect(text.startsWith('<untrusted_data>')).toBe(true);
      expect(result.structuredContent).toEqual({
        repo: 'acme/payments-api',
        prNumber: 482,
        summary: '1 changed symbol, 1 caller, 1 endpoint affected.',
        degraded: false,
        reason: null,
        changedSymbols: ['reviewPr (src/modules/reviews/helpers.ts)'],
        downstream: [
          {
            symbol: 'reviewPr',
            callers: ['src/modules/reviews/service.ts:42 runReview'],
            endpoints: ['POST /runs'],
            crons: [],
          },
        ],
      });
      expect(api.blastCalls).toEqual(['pr-1']);
    });

    it('gives isError with a not-in-DevDigest message and hint for an unknown PR number', async () => {
      api.repos = [buildRepo({ id: 'r1', full_name: 'acme/payments-api' })];
      api.pullsByRepoId.set('r1', [buildPrMeta({ id: 'pr-1', number: 482 })]);

      const result = await client.callTool({
        name: 'get_blast_radius',
        arguments: { repo: 'acme/payments-api', prNumber: 999 },
      });

      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ text: string }>)[0]?.text ?? '';
      expect(text).toContain('PR #999 is not in DevDigest for acme/payments-api.');
      expect(text).toContain('Open this PR in DevDigest once');
      expect(api.blastCalls).toEqual([]);
    });

    it('gives isError listing imported repos for an unknown repo', async () => {
      api.repos = [buildRepo({ full_name: 'acme/known-repo' })];
      const result = await client.callTool({
        name: 'get_blast_radius',
        arguments: { repo: 'acme/unknown', prNumber: 1 },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ text: string }>)[0]?.text ?? '';
      expect(text).toContain('acme/known-repo');
    });

    it('adds the not-in-DevDigest hint once on a 404 from getBlastRadius', async () => {
      api.repos = [buildRepo({ id: 'r1', full_name: 'acme/payments-api' })];
      api.pullsByRepoId.set('r1', [buildPrMeta({ id: 'pr-1', number: 482 })]);
      // `getBlastRadiusFailWith` (not `failWith`) so resolveRepo/listPulls
      // still succeed and only the getBlastRadius call itself fails.
      api.getBlastRadiusFailWith = new ApiError('not_found', 'Pull request not found');

      const result = await client.callTool({
        name: 'get_blast_radius',
        arguments: { repo: 'acme/payments-api', prNumber: 482 },
      });

      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ text: string }>)[0]?.text ?? '';
      const hintCount = text.split('Open this PR in DevDigest once').length - 1;
      expect(hintCount).toBe(1);
    });
  });
});
