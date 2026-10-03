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
  buildReviewRecord,
  buildRunSummary,
  buildStartRunResponse,
  FakeDevDigestApi,
} from './fakes.js';

const config = { apiUrl: 'http://localhost:3001', requestTimeoutMs: 15_000 };

// `agentId` is validated as uuids by the tool input schemas.
const AGENT_ID = '11111111-1111-1111-1111-111111111111';
const RUN_RUNNING = '33333333-3333-3333-3333-333333333333';

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
        next: 'Call get_findings with this repo and prNumber to check progress and read results.',
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
    function seedPr(): void {
      api.repos = [buildRepo({ id: 'r1', full_name: 'acme/payments-api' })];
      api.pullsByRepoId.set('r1', [buildPrMeta({ id: 'pr-1', number: 482 })]);
    }
    const call = (args: Record<string, unknown> = {}) =>
      client.callTool({ name: 'get_findings', arguments: { repo: 'acme/payments-api', prNumber: 482, ...args } });

    it('returns per-agent reviews with nested findings and totals, fenced as untrusted', async () => {
      seedPr();
      api.reviewsByPrId.set('pr-1', [
        buildReviewRecord({
          agent_id: 'a1',
          agent_name: 'Security',
          run_id: 'run-a1',
          findings: [buildFinding({ id: 'f1', severity: 'CRITICAL' }), buildFinding({ id: 'f2', severity: 'WARNING' })],
        }),
        buildReviewRecord({
          agent_id: 'a2',
          agent_name: 'Style',
          run_id: 'run-a2',
          findings: [buildFinding({ id: 'f3', severity: 'SUGGESTION' })],
        }),
      ]);

      const result = await call();

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ text: string }>)[0]?.text ?? '';
      expect(text.startsWith('<untrusted_data>')).toBe(true);
      const structured = result.structuredContent as {
        total_findings: number;
        counts: Record<string, number>;
        reviews: Array<{ agent_name: string; total_findings: number; findings: Array<{ id: string }> }>;
        in_progress: unknown[];
      };
      expect(structured.reviews.map((r) => r.agent_name)).toEqual(['Security', 'Style']);
      expect(structured.reviews[0]?.findings.map((f) => f.id)).toEqual(['f1', 'f2']);
      expect(structured.reviews[1]?.total_findings).toBe(1);
      expect(structured.total_findings).toBe(3);
      expect(structured.counts).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 1 });
      expect(structured.in_progress).toEqual([]);
    });

    it('lists running agents in in_progress with the retry hint', async () => {
      seedPr();
      api.runsByPrId.set('pr-1', [
        buildRunSummary({ run_id: RUN_RUNNING, agent_id: 'a1', agent_name: 'Security', status: 'running' }),
      ]);

      const result = await call();

      const body = result.structuredContent as { in_progress: unknown[]; hint?: string };
      expect(body.in_progress).toEqual([{ agent_name: 'Security' }]);
      expect(body.hint).toMatch(/~15s/);
    });

    it('gives isError listing imported repos for an unknown repo', async () => {
      api.repos = [buildRepo({ full_name: 'acme/known-repo' })];
      const result = await client.callTool({ name: 'get_findings', arguments: { repo: 'acme/unknown', prNumber: 1 } });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ text: string }>)[0]?.text ?? '';
      expect(text).toContain('acme/known-repo');
    });

    it('gives isError with a not-in-DevDigest message and hint for an unknown PR number', async () => {
      seedPr();
      const result = await call({ prNumber: 999 });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ text: string }>)[0]?.text ?? '';
      expect(text).toContain('PR #999 is not in DevDigest for acme/payments-api.');
      expect(text).toContain('Open this PR in DevDigest once');
    });

    it('turns a listPullReviews failure into an apiErrorResult', async () => {
      seedPr();
      api.listPullReviewsFailWith = new ApiError('server', 'boom');
      const result = await call();
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ text: string }>)[0]?.text ?? '';
      expect(text).toContain('boom');
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
