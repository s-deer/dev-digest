import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpDevDigestApi } from '../src/api/http.js';
import { ApiError } from '../src/api/errors.js';
import {
  buildAgent,
  buildBlastRadiusResponse,
  buildPrMeta,
  buildRepo,
  buildReviewRecord,
  buildRunSummary,
  buildStartRunResponse,
} from './fakes.js';

const config = { apiUrl: 'http://localhost:3001', requestTimeoutMs: 15_000 };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function expectApiError(promise: Promise<unknown>, kind: string): Promise<ApiError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).kind).toBe(kind);
    return err as ApiError;
  }
  throw new Error('expected promise to reject');
}

describe('HttpDevDigestApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses a valid agents list', async () => {
    const agent = buildAgent();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, [agent])));
    const api = new HttpDevDigestApi(config);
    await expect(api.listAgents()).resolves.toEqual([agent]);
  });

  it('parses a valid repos list', async () => {
    const repo = buildRepo();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, [repo])));
    const api = new HttpDevDigestApi(config);
    await expect(api.listRepos()).resolves.toEqual([repo]);
  });

  it('maps a network failure to kind "unreachable"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const api = new HttpDevDigestApi(config);
    // The dev.sh hint is appended once, by `apiErrorResult` (see
    // format.test.ts) — not duplicated into the raw ApiError message here.
    const err = await expectApiError(api.listAgents(), 'unreachable');
    expect(err.message).toMatch(/not reachable/);
  });

  it('maps HTTP 404 to kind "not_found"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(404, { error: { code: 'not_found', message: 'Repo not found' } })),
    );
    const api = new HttpDevDigestApi(config);
    const err = await expectApiError(api.listRepos(), 'not_found');
    expect(err.message).toBe('Repo not found');
  });

  it('maps HTTP 422 to kind "validation"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(422, { error: { code: 'validation_error', message: 'Bad input' } })),
    );
    const api = new HttpDevDigestApi(config);
    await expectApiError(api.listAgents(), 'validation');
  });

  it('maps HTTP 429 to kind "rate_limited"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(429, { error: { code: 'rate_limited', message: 'Slow down' } })));
    const api = new HttpDevDigestApi(config);
    await expectApiError(api.listAgents(), 'rate_limited');
  });

  it('maps HTTP 500 to kind "server"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, { error: { code: 'internal_error', message: 'Boom' } })));
    const api = new HttpDevDigestApi(config);
    await expectApiError(api.listAgents(), 'server');
  });

  it('maps a body that does not match the shared contract to kind "bad_response"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, [{ unexpected: true }])));
    const api = new HttpDevDigestApi(config);
    await expectApiError(api.listAgents(), 'bad_response');
  });

  it('maps a non-JSON success body to kind "bad_response"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('not json', { status: 200 })),
    );
    const api = new HttpDevDigestApi(config);
    await expectApiError(api.listAgents(), 'bad_response');
  });

  it('startRun POSTs a JSON body with snake_case keys and parses the response', async () => {
    const response = buildStartRunResponse();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, response));
    vi.stubGlobal('fetch', fetchMock);
    const api = new HttpDevDigestApi(config);

    await expect(api.startRun({ repoId: 'repo-1', prNumber: 482, agentId: 'agent-1' })).resolves.toEqual(response);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/runs');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'content-type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({ repo_id: 'repo-1', pr_number: 482, agent_id: 'agent-1' });
  });

  it('listPullReviews / listPullRuns parse valid arrays from /pulls/:id/*', async () => {
    const review = buildReviewRecord();
    const run = buildRunSummary();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, [review]))
      .mockResolvedValueOnce(jsonResponse(200, [run]));
    vi.stubGlobal('fetch', fetchMock);
    const api = new HttpDevDigestApi(config);

    await expect(api.listPullReviews('pr-1')).resolves.toEqual([review]);
    await expect(api.listPullRuns('pr-1')).resolves.toEqual([run]);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'http://localhost:3001/pulls/pr-1/reviews',
      'http://localhost:3001/pulls/pr-1/runs',
    ]);
  });

  it('maps a missing PR (404) to kind "not_found"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(404, { error: { code: 'not_found', message: 'PR not found' } })),
    );
    const api = new HttpDevDigestApi(config);
    const err = await expectApiError(api.listPullReviews('missing'), 'not_found');
    expect(err.message).toBe('PR not found');
  });

  it('parses a valid pulls list', async () => {
    const pr = buildPrMeta();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, [pr])));
    const api = new HttpDevDigestApi(config);
    await expect(api.listPulls('repo-1')).resolves.toEqual([pr]);
  });

  it('parses a valid blast radius response', async () => {
    const blast = buildBlastRadiusResponse();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, blast)));
    const api = new HttpDevDigestApi(config);
    await expect(api.getBlastRadius('pr-1')).resolves.toEqual(blast);
  });

  it('maps a missing blast radius (404) to kind "not_found"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(404, { error: { code: 'not_found', message: 'Pull request not found' } })),
    );
    const api = new HttpDevDigestApi(config);
    const err = await expectApiError(api.getBlastRadius('missing'), 'not_found');
    expect(err.message).toBe('Pull request not found');
  });
});
