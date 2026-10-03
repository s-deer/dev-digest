/* layoutBlastGraph — pure, deterministic layout for the graph view: a
   3-column node/edge graph built straight from a BlastRadiusResponse, no
   parsing or I/O. Columns are (1) changed symbols, (2) their callers, and
   (3) the endpoints and crons those callers reach. Nodes shared across
   downstream groups (a caller under two changed symbols, an endpoint or
   cron reached from two groups) are deduped to one node with one edge per
   distinct connection. */
import type { BlastCaller, BlastRadiusResponse } from "@devdigest/shared";

export type BlastGraphNodeKind = "symbol" | "caller" | "endpoint" | "cron";

export interface BlastGraphNode {
  id: string;
  kind: BlastGraphNodeKind;
  label: string;
  x: number;
  y: number;
  file?: string;
  line?: number;
}

export interface BlastGraphEdge {
  from: string;
  to: string;
}

export interface BlastGraphLayout {
  nodes: BlastGraphNode[];
  edges: BlastGraphEdge[];
  width: number;
  height: number;
}

/** Fixed node box size, shared with `BlastGraph.tsx` so edges and rects line up. */
export const NODE_WIDTH = 190;
export const NODE_HEIGHT = 34;

const COLUMN_GAP = 210;
const ROW_GAP = 50;
const PADDING_X = NODE_WIDTH / 2 + 24;
const PADDING_Y = NODE_HEIGHT / 2 + 20;

const EMPTY_LAYOUT: BlastGraphLayout = { nodes: [], edges: [], width: 0, height: 0 };

function callerId(caller: BlastCaller): string {
  return `caller:${caller.file}|${caller.line}|${caller.name}`;
}

/** Truncates a label for the SVG box; callers should always pair this with a
    `<title>` holding the untruncated text so the value is never lost. */
export function truncateLabel(label: string, max = 24): string {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}

export function layoutBlastGraph(blast: BlastRadiusResponse): BlastGraphLayout {
  if (blast.downstream.length === 0) return EMPTY_LAYOUT;

  const symbolNodes: BlastGraphNode[] = [];
  const callerNodes = new Map<string, BlastGraphNode>();
  const sinkNodes = new Map<string, BlastGraphNode>();
  const edgeKeys = new Set<string>();
  const edges: BlastGraphEdge[] = [];

  function addEdge(from: string, to: string) {
    const key = `${from}->${to}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ from, to });
  }

  for (const group of blast.downstream) {
    const symbolId = `symbol:${group.symbol}`;
    symbolNodes.push({ id: symbolId, kind: "symbol", label: group.symbol, x: 0, y: 0 });

    for (const caller of group.callers) {
      const cid = callerId(caller);
      if (!callerNodes.has(cid)) {
        callerNodes.set(cid, {
          id: cid,
          kind: "caller",
          label: caller.name,
          x: 0,
          y: 0,
          file: caller.file,
          line: caller.line,
        });
      }
      addEdge(symbolId, cid);

      for (const endpoint of group.endpoints_affected) {
        const eid = `endpoint:${endpoint}`;
        if (!sinkNodes.has(eid)) sinkNodes.set(eid, { id: eid, kind: "endpoint", label: endpoint, x: 0, y: 0 });
        addEdge(cid, eid);
      }
      for (const cron of group.crons_affected) {
        const cronId = `cron:${cron}`;
        if (!sinkNodes.has(cronId)) sinkNodes.set(cronId, { id: cronId, kind: "cron", label: cron, x: 0, y: 0 });
        addEdge(cid, cronId);
      }
    }
  }

  const columns = [symbolNodes, [...callerNodes.values()], [...sinkNodes.values()]].filter((col) => col.length > 0);
  const rowCount = Math.max(1, ...columns.map((col) => col.length));
  const height = PADDING_Y * 2 + Math.max(0, rowCount - 1) * ROW_GAP;

  const nodes: BlastGraphNode[] = [];
  columns.forEach((col, colIdx) => {
    const x = PADDING_X + colIdx * COLUMN_GAP;
    const span = Math.max(0, col.length - 1) * ROW_GAP;
    const startY = (height - span) / 2;
    col.forEach((node, rowIdx) => {
      nodes.push({ ...node, x, y: startY + rowIdx * ROW_GAP });
    });
  });

  const width = PADDING_X * 2 + Math.max(0, columns.length - 1) * COLUMN_GAP;

  return { nodes, edges, width, height };
}
