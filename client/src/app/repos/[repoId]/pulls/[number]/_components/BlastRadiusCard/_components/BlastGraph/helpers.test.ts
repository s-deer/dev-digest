import { describe, expect, it } from "vitest";
import type { BlastRadiusResponse } from "@devdigest/shared";
import { layoutBlastGraph, truncateLabel } from "./helpers";

const BLAST: BlastRadiusResponse = {
  changed_symbols: [
    { name: "rateLimit", file: "src/middleware/ratelimit.ts", kind: "function" },
    { name: "bucketKey", file: "src/middleware/ratelimit.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "rateLimit",
      callers: [
        { name: "handleRequest", file: "src/api/public/index.ts", line: 23 },
        { name: "handleWebhook", file: "src/api/public/webhooks.ts", line: 45 },
      ],
      endpoints_affected: ["GET /api/public/items", "POST /api/public/webhooks"],
      crons_affected: ["reset-rate-buckets (hourly)"],
    },
    {
      symbol: "bucketKey",
      // Same caller as above, plus one that shares the same cron.
      callers: [
        { name: "handleRequest", file: "src/api/public/index.ts", line: 23 },
        { name: "resetBuckets", file: "src/jobs/reset-buckets.ts", line: 8 },
      ],
      endpoints_affected: [],
      crons_affected: ["reset-rate-buckets (hourly)"],
    },
  ],
  summary: "2 symbol(s) changed, 3 caller(s), 2 endpoint(s), 1 cron(s) affected",
  degraded: false,
  reason: null,
};

describe("layoutBlastGraph", () => {
  it("returns an empty layout for no downstream impact", () => {
    const layout = layoutBlastGraph({ ...BLAST, downstream: [] });
    expect(layout).toEqual({ nodes: [], edges: [], width: 0, height: 0 });
  });

  it("builds one node per distinct symbol/caller/endpoint/cron, deduping shared callers and sinks", () => {
    const layout = layoutBlastGraph(BLAST);

    const byKind = (kind: string) => layout.nodes.filter((n) => n.kind === kind);
    expect(byKind("symbol")).toHaveLength(2);
    // "handleRequest" is a caller of both rateLimit and bucketKey — one node.
    expect(byKind("caller")).toHaveLength(3);
    expect(byKind("endpoint")).toHaveLength(2);
    // The same cron is affected by both groups — one node.
    expect(byKind("cron")).toHaveLength(1);
    expect(layout.nodes).toHaveLength(8);

    const dedupedCaller = layout.nodes.find((n) => n.kind === "caller" && n.label === "handleRequest");
    expect(dedupedCaller).toBeDefined();

    // Edges: symbol->caller (2+2=4, no dup) + caller->endpoint/cron.
    // rateLimit's two callers each connect to 2 endpoints + 1 cron = 3 edges each = 6.
    // bucketKey's two callers each connect to the shared cron only = 2 edges,
    // but handleRequest->cron is already present from rateLimit's group, so it dedupes to 1 new edge.
    const edgeKeys = new Set(layout.edges.map((e) => `${e.from}->${e.to}`));
    expect(edgeKeys.size).toBe(layout.edges.length);
    expect(layout.edges.some((e) => e.from === "symbol:rateLimit" && e.to === dedupedCaller!.id)).toBe(true);
    expect(layout.edges.some((e) => e.from === "symbol:bucketKey" && e.to === dedupedCaller!.id)).toBe(true);

    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });

  it("leaves a group with no callers as a lone symbol node with no outgoing edges", () => {
    const layout = layoutBlastGraph({
      ...BLAST,
      downstream: [{ symbol: "orphan", callers: [], endpoints_affected: [], crons_affected: [] }],
    });
    expect(layout.nodes).toEqual([expect.objectContaining({ kind: "symbol", label: "orphan" })]);
    expect(layout.edges).toEqual([]);
  });
});

describe("truncateLabel", () => {
  it("passes short labels through unchanged", () => {
    expect(truncateLabel("handleRequest")).toBe("handleRequest");
  });

  it("truncates long labels and keeps the result at the requested max length", () => {
    const long = "POST /api/public/webhooks/very/long/path/segment";
    const truncated = truncateLabel(long, 20);
    expect(truncated).toHaveLength(20);
    expect(truncated.endsWith("…")).toBe(true);
  });
});
