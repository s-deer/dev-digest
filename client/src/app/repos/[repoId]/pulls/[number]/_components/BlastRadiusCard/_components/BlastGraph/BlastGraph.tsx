/* BlastGraph — the graph view of a BlastRadiusResponse: an inline SVG with a
   deterministic 3-column layout from `layoutBlastGraph` (symbols → callers →
   endpoints/crons). Caller nodes link to the file:line on GitHub, same as
   the tree view's SymbolImpact list. The card scrolls this horizontally;
   the SVG itself is sized to its layout, not the viewport. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { BlastRadiusResponse } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { layoutBlastGraph, NODE_HEIGHT, NODE_WIDTH, truncateLabel, type BlastGraphNode } from "./helpers";
import { KIND_COLORS, s } from "./styles";

function edgePath(from: BlastGraphNode, to: BlastGraphNode): string {
  const x1 = from.x + NODE_WIDTH / 2;
  const x2 = to.x - NODE_WIDTH / 2;
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${x2} ${to.y}`;
}

export function BlastGraph({
  blast,
  repoFullName,
  headSha,
}: {
  blast: BlastRadiusResponse;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("blast");
  const layout = React.useMemo(() => layoutBlastGraph(blast), [blast]);

  if (layout.nodes.length === 0) {
    return <p style={s.empty}>{t("graph.empty")}</p>;
  }

  const byId = new Map(layout.nodes.map((n) => [n.id, n]));

  return (
    <div style={s.scroller}>
      <svg role="img" aria-label={t("graph.ariaLabel")} width={layout.width} height={layout.height} style={s.svg}>
        {layout.edges.map((edge) => {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          if (!from || !to) return null;
          return <path key={`${edge.from}->${edge.to}`} d={edgePath(from, to)} style={s.edge} />;
        })}
        {layout.nodes.map((node) => {
          const colors = KIND_COLORS[node.kind];
          const href =
            node.kind === "caller" && repoFullName && headSha && node.file && node.line != null
              ? githubBlobUrl(repoFullName, headSha, node.file, node.line)
              : undefined;
          const box = (
            <g>
              <title>{node.label}</title>
              <rect
                x={node.x - NODE_WIDTH / 2}
                y={node.y - NODE_HEIGHT / 2}
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={8}
                style={{ fill: colors.fill, stroke: colors.stroke, strokeWidth: 1.25 }}
              />
              <text x={node.x} y={node.y} textAnchor="middle" dominantBaseline="middle" style={{ fill: colors.text }}>
                {truncateLabel(node.label)}
              </text>
            </g>
          );
          return (
            <g key={node.id}>
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {box}
                </a>
              ) : (
                box
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
