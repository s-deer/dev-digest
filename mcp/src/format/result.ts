import { wrapUntrustedJson } from './untrusted.js';

/**
 * Ring 1 — pure result shaping, no logging. Structurally compatible with the
 * MCP SDK's `CallToolResult` (text-only content), without importing SDK
 * types into a "pure" file — the composition happens in `src/tools/*`.
 */
export interface ToolTextBlock extends Record<string, unknown> {
  type: 'text';
  text: string;
}

export interface ToolResult extends Record<string, unknown> {
  content: ToolTextBlock[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** A successful result: the same JSON in `structuredContent` and a text block. */
export function okResult(structured: Record<string, unknown>): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(structured) }], structuredContent: structured };
}

/**
 * A successful result whose text block is fenced as untrusted (PR/LLM
 * content). `structuredContent` stays plain JSON — the fence is for the
 * natural-language surface, not the machine-readable one.
 */
export function untrustedResult(structured: Record<string, unknown>): ToolResult {
  return { content: [{ type: 'text', text: wrapUntrustedJson(structured) }], structuredContent: structured };
}

/** A tool-level error: `isError: true` with actionable text, never a protocol error. */
export function errorResult(message: string, hints: string[] = []): ToolResult {
  const text = hints.length > 0 ? `${message} ${hints.join(' ')}` : message;
  return { content: [{ type: 'text', text }], isError: true };
}

const HINT_BY_KIND: Record<string, string> = {
  unreachable: 'Start the API with ./scripts/dev.sh, then retry.',
  not_found: 'Check the id or name and try again.',
  validation: 'Check the tool input against its schema.',
  rate_limited: 'Wait a moment and retry.',
  server: 'The DevDigest API had an internal error; check its logs.',
  bad_response: 'The DevDigest API returned an unexpected shape; check its logs.',
};

/** Shapes an `ApiError`-like value (kind + message) into a tool error result. */
export function apiErrorResult(err: { kind: string; message: string }, hints: string[] = []): ToolResult {
  const kindHint = HINT_BY_KIND[err.kind];
  return errorResult(err.message, kindHint ? [kindHint, ...hints] : hints);
}
