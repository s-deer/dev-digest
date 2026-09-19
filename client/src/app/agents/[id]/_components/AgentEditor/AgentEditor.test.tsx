import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import { Providers } from "../../../../../lib/providers";

import { AgentEditor } from "./AgentEditor";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const skills = [
  { id: "sk1", name: "Test rubric", description: "Checks tests", type: "rubric", source: "manual", body: "# Test", enabled: true, version: 1 },
  { id: "sk2", name: "API compatibility", description: "Checks contracts", type: "convention", source: "manual", body: "# API", enabled: true, version: 1 },
];
const links = [
  { agent_id: "ag1", skill_id: "sk1", enabled: true, order: 0 },
  { agent_id: "ag1", skill_id: "sk2", enabled: true, order: 1 },
];
let requests: Array<[RequestInfo | URL, RequestInit | undefined]>;

beforeEach(() => {
  requests = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    requests.push([input, init]);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url).pathname;
    const method = init?.method ?? "GET";
    const json = (value: unknown) =>
      new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });

    if (path === "/providers/openai/models") return json([{ id: "gpt-4.1" }]);
    if (path === "/skills" && method === "GET") return json(skills);
    if (path === "/agents/ag1/skills" && method === "GET") return json(links);
    if (path === "/agents/ag1/skills" && method === "POST") return json(links);
    return new Response(null, { status: 404 });
  });
});

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
  skill_count: 3,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <Providers>
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        {ui}
      </NextIntlClientProvider>
    </Providers>,
  );
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByRole("button", { name: "Config" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skills" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Evals" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stats" })).not.toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });

  it("renders linked skills in the Skills tab", async () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="skills" onTab={() => {}} />);
    expect(await screen.findByRole("heading", { name: "Skills" })).toBeInTheDocument();
    expect(await screen.findByText("Test rubric")).toBeInTheDocument();
    expect(screen.getByText("2 of 2 enabled")).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Enable Test rubric for this agent" });
    expect(within(group).getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("filters the available skills", async () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="skills" onTab={() => {}} />);

    await screen.findByText("Test rubric");
    fireEvent.change(screen.getByRole("textbox", { name: "Filter skills…" }), { target: { value: "API" } });

    expect(screen.getByText("API compatibility")).toBeInTheDocument();
    expect(screen.queryByText("Test rubric")).not.toBeInTheDocument();
  });

  it("keeps accessible move controls for ordered skill attachments", async () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="skills" onTab={() => {}} />);

    await screen.findByText("Test rubric");
    fireEvent.click(screen.getAllByRole("button", { name: "Move down" })[0]!);

    await waitFor(() => expect(requests.some(([, init]) => init?.method === "POST")).toBe(true));
    const post = requests.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({
      links: [
        { skill_id: "sk2", enabled: true, order: 0 },
        { skill_id: "sk1", enabled: true, order: 1 },
      ],
    });
  });
});
