import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BlastRadiusResponse } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/blast.json";
import { BlastRadiusCard } from "./BlastRadiusCard";

/** The stats row wraps each count in its own <strong>, so RTL's default
    `getByText` (which only reads an element's direct text-node children,
    not descendants) never sees "N label" as one string on the wrapping
    span. Match on the element's full `textContent` instead. */
function fullText(text: string) {
  return (_: string, element: Element | null) => element?.textContent?.replace(/\s+/g, " ").trim() === text;
}

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
      callers: [{ name: "resetBuckets", file: "src/jobs/reset-buckets.ts", line: 8 }],
      endpoints_affected: [],
      crons_affected: ["reset-rate-buckets (hourly)"],
    },
  ],
  summary: "2 symbol(s) changed, 3 caller(s), 2 endpoint(s), 1 cron(s) affected",
  degraded: false,
  reason: null,
};

const hooks = vi.hoisted(() => ({
  data: null as BlastRadiusResponse | null,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));

vi.mock("@/lib/hooks/blast", () => ({
  blastKey: (prId: string | null) => ["pr-blast", prId] as const,
  usePrBlast: () => ({
    data: hooks.data,
    isLoading: hooks.isLoading,
    isError: hooks.isError,
    refetch: hooks.refetch,
  }),
}));

const resyncHooks = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
}));

vi.mock("@/lib/hooks/repo-intel", () => ({
  useResyncRepoIntel: () => ({
    mutate: resyncHooks.mutate,
    isPending: resyncHooks.isPending,
  }),
}));

afterEach(() => {
  cleanup();
  hooks.data = null;
  hooks.isLoading = false;
  hooks.isError = false;
  hooks.refetch.mockClear();
  resyncHooks.mutate.mockClear();
  resyncHooks.isPending = false;
});

function renderCard(props: { repoFullName?: string | null; headSha?: string | null } = {}) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
        <BlastRadiusCard prId="pr1" repoId="repo1" repoFullName={props.repoFullName} headSha={props.headSha} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("BlastRadiusCard", () => {
  it("shows the stats row, a caller link to the head sha, and separate endpoint/cron groups", () => {
    hooks.data = BLAST;
    renderCard({ repoFullName: "acme/payments-api", headSha: "abc1234" });

    expect(screen.getByText(fullText("2 symbols"))).toBeInTheDocument();
    expect(screen.getByText(fullText("3 callers"))).toBeInTheDocument();
    expect(screen.getByText(fullText("2 endpoints"))).toBeInTheDocument();
    expect(screen.getByText(fullText("1 cron/jobs"))).toBeInTheDocument();
    expect(screen.getByText("rateLimit")).toBeInTheDocument();

    const link = screen.getByText("src/api/public/index.ts:23");
    expect(link.closest("a")).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/abc1234/src/api/public/index.ts#L23",
    );

    expect(screen.getByText("Endpoints")).toBeInTheDocument();
    expect(screen.getByText("GET /api/public/items")).toBeInTheDocument();
    // Both symbol groups affect the same cron, so its group label repeats.
    expect(screen.getAllByText("Cron jobs").length).toBe(2);
    expect(screen.getAllByText("reset-rate-buckets (hourly)").length).toBe(2);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders plain text (no link) when repoFullName is unavailable", () => {
    hooks.data = BLAST;
    renderCard();

    const caller = screen.getByText("src/api/public/index.ts:23");
    expect(caller.closest("a")).toBeNull();
  });

  it("shows the empty-downstream text when there are no callers", () => {
    hooks.data = { ...BLAST, downstream: [] };
    renderCard();

    expect(screen.getByText("2 changed symbol(s), no downstream callers found.")).toBeInTheDocument();
    expect(screen.queryByText("rateLimit")).not.toBeInTheDocument();
  });

  it("shows the degraded badge with its reason, and retries on error", () => {
    hooks.data = { ...BLAST, degraded: true, reason: "index_partial" };
    renderCard();

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Degraded")).toBeInTheDocument();
    expect(
      screen.getByText("The index is only partially built; results may be incomplete."),
    ).toBeInTheDocument();

    cleanup();
    hooks.data = null;
    hooks.isError = true;
    renderCard();
    expect(screen.getByText("Couldn't load the blast radius.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(hooks.refetch).toHaveBeenCalledTimes(1);
  });

  it("collapses and re-expands a symbol's callers via its header toggle", () => {
    hooks.data = BLAST;
    renderCard();

    const toggle = screen.getByRole("button", { name: "Toggle callers for rateLimit" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("src/api/public/index.ts:23")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("src/api/public/index.ts:23")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("src/api/public/index.ts:23")).toBeInTheDocument();
  });

  it("shows a resync action on the degraded badge and triggers the mutation on click", () => {
    hooks.data = { ...BLAST, degraded: true, reason: "index_partial" };
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Resync index" }));
    expect(resyncHooks.mutate).toHaveBeenCalledTimes(1);
  });

  it("toggles to the graph view (with a caller link in the SVG) and back to the tree", () => {
    hooks.data = BLAST;
    renderCard({ repoFullName: "acme/payments-api", headSha: "abc1234" });

    const treeBtn = screen.getByRole("button", { name: "tree" });
    const graphBtn = screen.getByRole("button", { name: "graph" });
    expect(treeBtn).toHaveAttribute("aria-pressed", "true");
    expect(graphBtn).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(graphBtn);
    expect(graphBtn).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img", { name: "Blast radius graph" })).toBeInTheDocument();
    const callerLink = screen.getByText("handleRequest", { selector: "text" }).closest("a");
    expect(callerLink).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/abc1234/src/api/public/index.ts#L23",
    );
    // Tree content is gone while the graph is showing.
    expect(screen.queryByRole("button", { name: "Toggle callers for rateLimit" })).not.toBeInTheDocument();

    fireEvent.click(treeBtn);
    expect(treeBtn).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("img", { name: "Blast radius graph" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle callers for rateLimit" })).toBeInTheDocument();
  });
});
