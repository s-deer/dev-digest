import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import skillsMessages from "../../../../../../../../messages/en/skills.json";
import contextMessages from "../../../../../../../../messages/en/context.json";
import { Providers } from "../../../../../../../lib/providers";
import { ContextTab } from "./ContextTab";

const LIMITS = { doc_cap_tokens: 3000, run_budget_tokens: 100, max_attachments: 50 };
const TOKENS: Record<string, number> = { "specs/api.md": 60, "specs/sec.md": 70 };
const DOCS = Object.entries(TOKENS).map(([path, tokens]) => ({ path, type: "specs", tokens, size: 1, over_cap: false, used_by_agents: 0 }));

function savedFor(paths: string[]) {
  const items = paths.map((path) => ({ path, tokens: TOKENS[path] ?? 0, missing: false, over_cap: false }));
  const total = items.reduce((n, i) => n + i.tokens, 0);
  const would_skip = total > LIMITS.run_budget_tokens ? [{ path: items[items.length - 1]!.path, section: "project_specifications" }] : [];
  return { items, total_tokens: total, would_skip, limits: LIMITS };
}

const SKILL = { id: "sk1", name: "pr-quality-rubric" } as Skill;
let puts: string[][];

beforeEach(() => {
  puts = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { "content-type": "application/json" } });
    if (url.pathname === "/repos") return json([{ id: "r1", full_name: "acme/api", default_branch: "main", last_polled_at: null }]);
    if (url.pathname === "/repos/r1/project-context") {
      return json({ documents: DOCS, total_files: 2, total_tokens: 130, refreshed_at: "2026-10-10T10:00:00Z", patterns: ["**/*.md"], limits: LIMITS });
    }
    if (url.pathname === "/skills/sk1/project-context" && method === "GET") return json(savedFor(["specs/api.md"]));
    if (url.pathname === "/skills/sk1/project-context" && method === "PUT") {
      const paths = (JSON.parse(init!.body as string) as { paths: string[] }).paths;
      puts.push(paths);
      return json(savedFor(paths));
    }
    return new Response(null, { status: 404 });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Skill ContextTab", () => {
  it("attaches, reorders, shows 'Serializes as' and the over-budget warning", async () => {
    render(
      <Providers>
        <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages, context: contextMessages }}>
          <ContextTab skill={SKILL} />
        </NextIntlClientProvider>
      </Providers>,
    );
    expect(await screen.findByText("1 attached")).toBeInTheDocument();
    expect(screen.getByText("Any agent using this skill inherits these documents.")).toBeInTheDocument();
    expect(screen.getByText("≈ 60 tokens")).toBeInTheDocument();
    expect(screen.getByText(/## Project specifications/)).toHaveTextContent("## Project specifications - specs/api.md");

    fireEvent.click(screen.getByRole("checkbox", { name: "Attach specs/sec.md" }));
    expect(await screen.findByText("2 attached")).toBeInTheDocument();
    expect(puts.at(-1)).toEqual(["specs/api.md", "specs/sec.md"]);
    expect(screen.getByRole("alert")).toHaveTextContent("specs/sec.md");

    fireEvent.click(screen.getByRole("button", { name: "Move specs/sec.md up" }));
    expect(await screen.findByText(/- specs\/sec\.md\s*- specs\/api\.md/)).toBeInTheDocument();
    expect(puts.at(-1)).toEqual(["specs/sec.md", "specs/api.md"]);
  });
});
