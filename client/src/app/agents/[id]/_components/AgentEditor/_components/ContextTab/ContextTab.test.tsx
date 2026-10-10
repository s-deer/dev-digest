import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import contextMessages from "../../../../../../../../messages/en/context.json";
import { Providers } from "../../../../../../../lib/providers";
import { ContextTab } from "./ContextTab";

const LIMITS = { doc_cap_tokens: 3000, run_budget_tokens: 200, max_attachments: 50 };
const TOKENS: Record<string, number> = { "docs/a.md": 150, "docs/b.md": 100, "docs/c.md": 20 };
const DOCS = Object.entries(TOKENS).map(([path, tokens]) => ({
  path,
  type: "docs",
  tokens,
  size: tokens * 4,
  over_cap: false,
  used_by_agents: 0,
}));
const INHERITED = [{ path: "docs/c.md", via_skill_id: "sk1", via_skill_name: "Rubric", tokens: 20, missing: false, over_cap: false }];

/** Server-like state: totals and the over-budget warning derive from the saved paths. */
function savedFor(paths: string[]) {
  const items = paths.map((path) => ({ path, tokens: TOKENS[path] ?? 0, missing: false, over_cap: false }));
  const context = items.reduce((n, i) => n + i.tokens, 0);
  const specs = 20;
  const would_skip = context + specs > LIMITS.run_budget_tokens && items.length > 1
    ? [{ path: items[items.length - 1]!.path, section: "project_context" }]
    : [];
  return { items, total_tokens: context, would_skip, limits: LIMITS, inherited: INHERITED, totals: { context_tokens: context, specs_tokens: specs, total: context + specs } };
}

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;
let requests: Array<{ path: string; method: string; body?: string }>;
let repos: unknown[];

beforeEach(() => {
  requests = [];
  repos = [{ id: "r1", full_name: "acme/api", default_branch: "main", last_polled_at: null }];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    requests.push({ path: url.pathname, method, body: init?.body as string | undefined });
    const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { "content-type": "application/json" } });
    if (url.pathname === "/repos") return json(repos);
    if (url.pathname === "/repos/r1/project-context") {
      return json({ documents: DOCS, total_files: 3, total_tokens: 270, refreshed_at: "2026-10-10T10:00:00Z", patterns: ["**/*.md"], limits: LIMITS });
    }
    if (url.pathname === "/agents/ag1/project-context" && method === "GET") return json(savedFor(["docs/a.md"]));
    if (url.pathname === "/agents/ag1/project-context" && method === "PUT") {
      return json(savedFor((JSON.parse(init!.body as string) as { paths: string[] }).paths));
    }
    return new Response(null, { status: 404 });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const renderTab = () =>
  render(
    <Providers>
      <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, context: contextMessages }}>
        <ContextTab agent={AGENT} />
      </NextIntlClientProvider>
    </Providers>,
  );

describe("Agent ContextTab", () => {
  it("attaches a doc, saves the whole ordered list, and renders the server's totals and budget warning", async () => {
    renderTab();
    expect(await screen.findByText("1 of 3 attached")).toBeInTheDocument();
    expect(screen.getByText("≈ 170 tokens per LLM call")).toBeInTheDocument();
    // AC-18: breakdown per section (direct vs inherited) and the untrusted note.
    expect(screen.getByText("## Project context: 150 · ## Project specifications (from skills): 20")).toBeInTheDocument();
    expect(screen.getByText("Injected as untrusted blocks into every run.")).toBeInTheDocument();

    // Inherited rows are shown ticked, labelled with the skill, and cannot be toggled.
    const inherited = screen.getByRole("checkbox", { name: /docs\/c\.md \(inherited via skill Rubric, read-only\)/ });
    expect(inherited).toBeDisabled();
    expect(inherited).toBeChecked();

    fireEvent.click(screen.getByRole("checkbox", { name: "Attach docs/b.md" }));

    expect(await screen.findByText("2 of 3 attached")).toBeInTheDocument();
    const put = requests.find((r) => r.method === "PUT")!;
    expect(JSON.parse(put.body!)).toEqual({ repo_id: "r1", paths: ["docs/a.md", "docs/b.md"] });
    expect(screen.getByText("≈ 270 tokens per LLM call")).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("docs/b.md");
    expect(alert).toHaveTextContent("Project context");
  });

  it("without an active repository shows the select-a-repository prompt", async () => {
    repos = [];
    renderTab();
    await waitFor(() => expect(screen.getByText("Select a repository")).toBeInTheDocument());
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
