/**
 * The only module allowed to read `process.env` (package rule). Everything
 * else receives a resolved `McpConfig`.
 */

export interface McpConfig {
  /** Base URL of the DevDigest Fastify API, no trailing slash. */
  apiUrl: string;
  /** `DEVDIGEST_MCP_ENABLE_BLAST_RADIUS=1` gates the Phase-3 stub tool. */
  enableBlastRadius: boolean;
  /** Per-request timeout for the HTTP adapter. */
  requestTimeoutMs: number;
}

export const DEFAULT_API_URL = 'http://localhost:3001';
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Resolves config from the environment. Throws a plain `Error` (caught by
 * `index.ts`'s startup logging) if `DEVDIGEST_API_URL` is not an http(s) URL.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const rawUrl = env.DEVDIGEST_API_URL?.trim() || DEFAULT_API_URL;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`DEVDIGEST_API_URL is not a valid URL: "${rawUrl}"`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`DEVDIGEST_API_URL must be http or https, got "${parsed.protocol}"`);
  }

  return {
    apiUrl: rawUrl.replace(/\/+$/, ''),
    enableBlastRadius: env.DEVDIGEST_MCP_ENABLE_BLAST_RADIUS === '1',
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
  };
}
