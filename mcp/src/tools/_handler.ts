import { log } from '../log.js';
import { ApiError } from '../api/errors.js';
import { apiErrorResult, errorResult, type ToolResult } from '../format/result.js';

/**
 * Wraps a tool callback so every throw becomes `isError: true` instead of a
 * protocol-level failure. `ApiError`s are expected, user-facing outcomes and
 * are not logged; anything else is unexpected and gets one stderr line here
 * — the single place in the tool ring allowed to log (onion review fix #3).
 */
export function safeHandler<Args extends unknown[]>(
  toolName: string,
  handler: (...args: Args) => Promise<ToolResult>,
): (...args: Args) => Promise<ToolResult> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof ApiError) {
        return apiErrorResult(err);
      }
      log.error(`unhandled error in tool ${toolName}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return errorResult(`Internal error in ${toolName}. Check the mcp server's stderr logs.`);
    }
  };
}
