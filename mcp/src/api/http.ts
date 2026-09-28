import {
  Agent,
  ApiErrorBody,
  ConventionsState,
  ConventionStatus,
  Repo,
  RunDetail,
  StartRunResponse,
} from '@devdigest/shared';
import type { McpConfig } from '../config.js';
import { ApiError, type ApiErrorKind } from './errors.js';
import type { DevDigestApi } from './port.js';

/**
 * Duck-typed instead of `z.ZodType<T>` — inferring `T` through mcp's own
 * `z.ZodType` generic loses the narrowed (non-optional) output type of a
 * `.default()` field on a schema built by `@devdigest/shared`'s zod copy
 * (`tsc` silently widens `strategy`/`ci_fail_on`/etc. back to optional). See
 * mcp/INSIGHTS.md.
 */
interface SafeParser<T> {
  safeParse(body: unknown): { success: true; data: T } | { success: false; error: unknown };
}

/**
 * Ring 4 — the only file in this package allowed to call `fetch`. Every
 * response is `safeParse`d against the shared contract; a mismatch becomes
 * a `bad_response` ApiError rather than a leaked raw shape. Bodies are never
 * logged (they may carry PR/LLM content).
 */
export class HttpDevDigestApi implements DevDigestApi {
  constructor(private readonly config: McpConfig) {}

  async listAgents(): Promise<Agent[]> {
    const body = await this.request('/agents');
    return this.parse(Agent.array(), body, 'GET /agents');
  }

  async listRepos(): Promise<Repo[]> {
    const body = await this.request('/repos');
    return this.parse(Repo.array(), body, 'GET /repos');
  }

  async getConventions(repoId: string, statuses: ConventionStatus[]): Promise<ConventionsState> {
    const query = statuses.length > 0 ? `?status=${encodeURIComponent(statuses.join(','))}` : '';
    const path = `/repos/${encodeURIComponent(repoId)}/conventions${query}`;
    const body = await this.request(path);
    return this.parse(ConventionsState, body, `GET /repos/${repoId}/conventions`);
  }

  async startRun(input: { repoId: string; prNumber: number; agentId: string }): Promise<StartRunResponse> {
    const body = await this.request('/runs', {
      method: 'POST',
      body: { repo_id: input.repoId, pr_number: input.prNumber, agent_id: input.agentId },
    });
    return this.parse(StartRunResponse, body, 'POST /runs');
  }

  async getRun(runId: string): Promise<RunDetail> {
    const path = `/runs/${encodeURIComponent(runId)}`;
    const body = await this.request(path);
    return this.parse(RunDetail, body, `GET ${path}`);
  }

  private async request(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<unknown> {
    const url = `${this.config.apiUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    const hasBody = init.body !== undefined;

    let response: Response;
    try {
      response = await fetch(url, {
        method: init.method ?? 'GET',
        signal: controller.signal,
        headers: hasBody
          ? { accept: 'application/json', 'content-type': 'application/json' }
          : { accept: 'application/json' },
        ...(hasBody ? { body: JSON.stringify(init.body) } : {}),
      });
    } catch {
      // No dev.sh hint here — `apiErrorResult` (src/format/result.ts) already
      // appends one kind-specific hint per `ApiError.kind`; adding it here
      // too duplicated the text in the tool's error output.
      throw new ApiError('unreachable', `DevDigest API is not reachable at ${this.config.apiUrl}.`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw await this.errorFor(response);
    }

    try {
      return await response.json();
    } catch {
      throw new ApiError('bad_response', `Response from ${path} was not valid JSON.`);
    }
  }

  private async errorFor(response: Response): Promise<ApiError> {
    const kind = kindForStatus(response.status);
    let message = `DevDigest API responded with ${response.status}.`;
    try {
      const raw: unknown = await response.json();
      const parsed = ApiErrorBody.safeParse(raw);
      if (parsed.success) {
        message = parsed.data.error.message;
      }
    } catch {
      // Body wasn't JSON or didn't match the envelope — keep the generic message.
    }
    return new ApiError(kind, message);
  }

  private parse<T>(schema: SafeParser<T>, body: unknown, context: string): T {
    const result = schema.safeParse(body);
    if (!result.success) {
      throw new ApiError('bad_response', `Response for ${context} did not match the expected shape.`);
    }
    return result.data;
  }
}

function kindForStatus(status: number): ApiErrorKind {
  if (status === 404) return 'not_found';
  if (status === 422) return 'validation';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  return 'bad_response';
}
