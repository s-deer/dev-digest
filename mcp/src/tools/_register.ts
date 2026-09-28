import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '../format/result.js';

export interface ToolConfig {
  title?: string;
  description: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: ToolAnnotations;
}

export type ToolHandler = (args: any, extra: unknown) => Promise<ToolResult>;

type RegisterToolFn = (name: string, config: ToolConfig, handler: ToolHandler) => unknown;

/**
 * Registers a tool through a hand-written, non-generic signature instead of
 * calling `McpServer.registerTool` (its own overload) directly. With zod
 * ^3.25 + SDK ^1.30, letting `tsc` infer `registerTool`'s generics from a
 * schema with an array-of-object field or several chained modifiers
 * (`.default().describe()`) intermittently explodes (TS2589, and on a full
 * build sometimes a V8 heap OOM) — and empirically, whether a *given* call
 * trips it depends on other, unrelated files in the same compilation, not
 * just that call's own shape (see mcp/INSIGHTS.md). This one narrow, always-
 * used cast keeps every tool registration on a stable, hand-written type
 * instead of fighting the SDK's inference per call site. Runtime behavior is
 * unaffected — the SDK still validates input/output against the real zod
 * schemas at call time; only compile-time checking of `args` inside a
 * handler is narrowed manually (each tool casts `args` to its own shape).
 */
export function registerTool(server: McpServer, name: string, config: ToolConfig, handler: ToolHandler): void {
  (server.registerTool as unknown as RegisterToolFn)(name, config, handler);
}

const TOOLS_LIST_METHOD = 'tools/list';
const JSON_SCHEMA_META_KEYS = new Set(['$schema', '$defs', '$ref']);

type ListToolsHandler = (request: unknown, extra: unknown) => Promise<{ tools: Array<Record<string, unknown>> }>;

/** The underlying SDK `Protocol`'s `setRequestHandler` doc explicitly allows
 *  replacing a method's handler ("this will replace any previous request
 *  handler for the same method"); reading the already-registered one back
 *  out of `_requestHandlers` before doing so is the only way to compose with
 *  it instead of reimplementing tool-list serialization. */
interface InternalProtocol {
  _requestHandlers: Map<string, ListToolsHandler>;
}

/**
 * `@modelcontextprotocol/sdk@1.30.1`'s `tools/list` handler always emits
 * `"$schema": "http://json-schema.org/draft-07/schema#"` on every
 * input/outputSchema (via the vendored `zod-to-json-schema`, which has no
 * option to suppress it) — the cross-cutting rule requires none. This must
 * run once, after every tool is registered (`server.ts`'s last step): it
 * takes over the `tools/list` method, delegates to the SDK's own
 * already-registered handler for the real work, and strips `$schema`
 * (and, defensively, `$defs`/`$ref`, though our flat schemas never emit
 * those) from the result. `tools/call`'s output validation reads
 * `tool.outputSchema` (the zod schema) directly, never this JSON Schema
 * projection, so `structuredContent` validation is unaffected. See
 * mcp/INSIGHTS.md.
 */
export function stripJsonSchemaMetaFromToolsList(server: McpServer): void {
  const internal = server.server as unknown as InternalProtocol;
  const original = internal._requestHandlers.get(TOOLS_LIST_METHOD);
  if (!original) {
    throw new Error('stripJsonSchemaMetaFromToolsList: register at least one tool before calling this.');
  }
  server.server.setRequestHandler(ListToolsRequestSchema, async (request, extra) => {
    const result = await original(request, extra);
    return { tools: result.tools.map(stripToolSchemaMeta) };
  });
}

function stripToolSchemaMeta(tool: Record<string, unknown>): Record<string, unknown> {
  const next = { ...tool };
  if (next.inputSchema) next.inputSchema = deepOmitKeys(next.inputSchema);
  if (next.outputSchema) next.outputSchema = deepOmitKeys(next.outputSchema);
  return next;
}

function deepOmitKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepOmitKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !JSON_SCHEMA_META_KEYS.has(key))
        .map(([key, v]) => [key, deepOmitKeys(v)]),
    );
  }
  return value;
}
