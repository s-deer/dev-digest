import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import { ToastProvider } from "../../../../../lib/toast";

const hooks = vi.hoisted(() => ({ setLinks: vi.fn() }));

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
  useAgentSkillLinks: () => ({ data: [{ agent_id: "ag1", skill_id: "sk1", enabled: true, order: 0 }, { agent_id: "ag1", skill_id: "sk2", enabled: true, order: 1 }], isLoading: false }),
  useSetAgentSkillLinks: () => ({ mutate: hooks.setLinks, isPending: false }),
}));

vi.mock("../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: [
    { id: "sk1", name: "Test rubric", description: "Checks tests", type: "rubric", source: "manual", body: "# Test", enabled: true, version: 1 },
    { id: "sk2", name: "API compatibility", description: "Checks contracts", type: "convention", source: "manual", body: "# API", enabled: true, version: 1 },
  ], isLoading: false }),
}));

import { AgentEditor } from "./AgentEditor";

afterEach(() => {
  cleanup();
  hooks.setLinks.mockClear();
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
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
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

  it("renders linked skills in the Skills tab", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="skills" onTab={() => {}} />);
    expect(screen.getByRole("heading", { name: "Skills" })).toBeInTheDocument();
    expect(screen.getByText("Test rubric")).toBeInTheDocument();
    expect(screen.getAllByText("Enabled for this agent")).toHaveLength(2);
    expect(screen.getByRole("checkbox", { name: "Test rubric" })).toHaveAttribute("aria-checked", "true");
  });

  it("filters the available skills", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="skills" onTab={() => {}} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Filter skills…" }), { target: { value: "API" } });

    expect(screen.getByText("API compatibility")).toBeInTheDocument();
    expect(screen.queryByText("Test rubric")).not.toBeInTheDocument();
  });

  it("keeps accessible move controls for ordered skill attachments", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="skills" onTab={() => {}} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Move down" })[0]!);

    expect(hooks.setLinks).toHaveBeenCalledWith({
      agentId: "ag1",
      links: [
        { skill_id: "sk2", enabled: true, order: 0 },
        { skill_id: "sk1", enabled: true, order: 1 },
      ],
    });
  });
});
