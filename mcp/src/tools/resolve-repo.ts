import type { Repo } from '@devdigest/shared';
import type { DevDigestApi } from '../api/port.js';
import { errorResult, type ToolResult } from '../format/result.js';

export type ResolveRepoResult = { ok: true; repo: Repo } | { ok: false; result: ToolResult };

/**
 * Resolves `owner/name` to a `Repo` via `GET /repos`. An unreachable API
 * propagates as `ApiError` (handled by `safeHandler`); an unknown repo comes
 * back as an `isError` result listing what is imported instead.
 */
export async function resolveRepo(api: DevDigestApi, fullName: string): Promise<ResolveRepoResult> {
  const repos = await api.listRepos();
  const repo = repos.find((r) => r.full_name === fullName);
  if (repo) return { ok: true, repo };

  const known = repos.map((r) => r.full_name);
  const hint =
    known.length > 0 ? `Imported repos: ${known.join(', ')}.` : 'No repos are imported yet — add one in DevDigest first.';
  return { ok: false, result: errorResult(`Repo "${fullName}" is not imported.`, [hint]) };
}
