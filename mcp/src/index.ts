import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { HttpDevDigestApi } from './api/http.js';
import { createServer } from './server.js';
import { log } from './log.js';

/**
 * Composition root: config → adapter → server → stdio transport. Tools are
 * registered (and listed) regardless of whether the API is reachable —
 * reachability is only checked per tool call.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const api = new HttpDevDigestApi(config);
  const server = createServer({ api, config });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info('devdigest mcp server connected over stdio', { apiUrl: config.apiUrl });
}

process.on('uncaughtException', (err) => {
  log.error('uncaught exception', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});

main().catch((err) => {
  log.error('failed to start devdigest mcp server', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
