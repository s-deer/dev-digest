import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadiusResponse } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/blast.json";
import { BlastGraph } from "./BlastGraph";

const BLAST: BlastRadiusResponse = {
  changed_symbols: [{ name: "rateLimit", file: "src/middleware/ratelimit.ts", kind: "function" }],
  downstream: [
    {
      symbol: "rateLimit",
      callers: [{ name: "handleRequest", file: "src/api/public/index.ts", line: 23 }],
      endpoints_affected: ["GET /api/public/items"],
      crons_affected: [],
    },
  ],
  summary: "1 symbol(s) changed, 1 caller(s), 1 endpoint(s), 0 cron(s) affected",
  degraded: false,
  reason: null,
};

function renderGraph(props: { repoFullName?: string | null; headSha?: string | null } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastGraph blast={BLAST} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("BlastGraph", () => {
  it("renders a labelled SVG with a caller link to the head sha", () => {
    renderGraph({ repoFullName: "acme/payments-api", headSha: "abc1234" });

    const svg = screen.getByRole("img", { name: "Blast radius graph" });
    expect(svg).toBeInTheDocument();

    // Both the node's <title> tooltip and its <text> label match the caller
    // name; scope to the SVG <text> element, which is what the link wraps.
    const link = screen.getByText("handleRequest", { selector: "text" }).closest("a");
    expect(link).toHaveAttribute("href", "https://github.com/acme/payments-api/blob/abc1234/src/api/public/index.ts#L23");
  });

  it("renders no link when repoFullName is unavailable", () => {
    renderGraph();
    expect(screen.getByText("handleRequest", { selector: "text" }).closest("a")).toBeNull();
  });

  it("shows the empty-graph text when there is no downstream impact", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
        <BlastGraph blast={{ ...BLAST, downstream: [] }} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("No downstream callers to graph.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
