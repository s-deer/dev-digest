import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/context.json";
import { ProjectContextView } from "./ProjectContextView";

const h = vi.hoisted(() => ({
  listing: { current: null as unknown },
  doc: { current: null as unknown },
  refetch: vi.fn(),
}));

vi.mock("@/lib/hooks/project-context", () => ({
  useProjectDocuments: () => h.listing.current,
  useProjectDocument: () => h.doc.current,
}));

const LIMITS = { doc_cap_tokens: 3000, run_budget_tokens: 7500, max_attachments: 50 };
const LISTING = {
  documents: [
    { path: "docs/architecture.md", type: "docs", tokens: 120, size: 400, over_cap: false, used_by_agents: 2 },
    { path: ".devdigest/specs/api.md", type: "specs", tokens: 80, size: 300, over_cap: false, used_by_agents: 0 },
  ],
  total_files: 2,
  total_tokens: 200,
  refreshed_at: "2026-10-10T10:00:00.000Z",
  patterns: ["**/{specs,docs,insights}/**/*.md"],
  limits: LIMITS,
};
const DOC = {
  path: "docs/architecture.md",
  type: "docs",
  tokens: 120,
  over_cap: false,
  content: "# Architecture\n\n<script>window.__pwned = true</script>\n\n![x](https://evil.example/p.png)",
  used_by: [
    { agent_id: "a1", agent_name: "Security Reviewer", via: "direct", skill_name: null },
    { agent_id: "a2", agent_name: "Perf Reviewer", via: "skill", skill_name: "pr-quality-rubric" },
  ],
};

const ok = (data: unknown) => ({ data, isLoading: false, isError: false, isFetching: false, refetch: h.refetch });

const renderView = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ProjectContextView repoId="r1" />
    </NextIntlClientProvider>,
  );

afterEach(() => {
  cleanup();
  h.refetch.mockReset();
});

describe("ProjectContextView", () => {
  it("lists docs read-only with the tokens-total footer, a safe preview and a used-by popover", () => {
    h.listing.current = ok(LISTING);
    h.doc.current = ok(DOC);
    renderView();

    expect(screen.getByText(/2 files · 200 tokens total/)).toBeInTheDocument();
    expect(screen.queryByText(/chunks/i)).not.toBeInTheDocument();
    // View-only: no edit tab, no create / upload / folder actions.
    expect(screen.queryByRole("button", { name: /edit|create|upload|new|add/i })).not.toBeInTheDocument();

    // First doc is previewed; script is inert and the remote image is not rendered.
    expect(screen.getByRole("heading", { name: "Architecture" })).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();

    // Used-by popover lists agents with direct / via-skill markers and links.
    const preview = screen.getByRole("heading", { name: "Architecture" }).closest("section")!;
    fireEvent.click(within(preview).getByRole("button", { name: "Used by 2 agents" }));
    const pop = screen.getByRole("dialog");
    expect(within(pop).getByRole("link", { name: "Security Reviewer" })).toHaveAttribute("href", "/agents/a1");
    expect(within(pop).getByText("direct")).toBeInTheDocument();
    expect(within(pop).getByText("via skill pr-quality-rubric")).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }));
    expect(h.refetch).toHaveBeenCalled();
  });

  it("list rows open the used-by popover too; rows with 0 agents have no control (AC-12, AC-53, D-22)", () => {
    h.listing.current = ok(LISTING);
    h.doc.current = ok(DOC);
    renderView();

    const list = screen.getByRole("complementary");
    // Only the doc with used_by_agents = 2 gets a control in the list.
    expect(within(list).getAllByRole("button", { name: /Used by/ })).toHaveLength(1);
    const trigger = within(list).getByRole("button", { name: "Used by 2 agents" });
    fireEvent.click(trigger);
    const pop = screen.getByRole("dialog");
    expect(within(pop).getByRole("link", { name: "Perf Reviewer" })).toHaveAttribute("href", "/agents/a2");
    expect(within(pop).getByText("via skill pr-quality-rubric")).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("empty state names the active patterns", () => {
    h.listing.current = ok({ ...LISTING, documents: [], total_files: 0, total_tokens: 0 });
    h.doc.current = ok(undefined);
    renderView();
    expect(screen.getByText("No project documents found")).toBeInTheDocument();
    expect(screen.getByText(/match \*\*\/\{specs,docs,insights\}\/\*\*\/\*\.md/)).toBeInTheDocument();
  });

  it("error state offers Retry and shows no stale list", () => {
    h.listing.current = { ...ok(LISTING), isError: true };
    renderView();
    expect(screen.getByText("Couldn’t load project documents")).toBeInTheDocument();
    expect(screen.queryByText("docs/architecture.md")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(h.refetch).toHaveBeenCalled();
  });

  it("previewing a doc nobody uses shows its tokens and no used-by control; no coverage metric, refresh time shown (AC-6, AC-8, AC-13, AC-53)", () => {
    h.listing.current = ok(LISTING);
    h.doc.current = ok({ ...DOC, path: ".devdigest/specs/api.md", type: "specs", tokens: 80, content: "# API spec", used_by: [] });
    renderView();

    fireEvent.click(screen.getByText(".devdigest/specs/api.md"));
    const heading = screen.getByRole("heading", { name: "API spec" });
    // The list row also shows the count, so scope to the preview pane.
    expect(within(heading.closest("section")!).getByText("80 tokens")).toBeInTheDocument();
    // N = 0: nothing to open.
    expect(within(heading.closest("section")!).queryByRole("button", { name: /Used by/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(/coverage/i)).not.toBeInTheDocument();
    expect(screen.getByText(/refreshed /)).toBeInTheDocument();
  });
});
