import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

const hooks = vi.hoisted(() => ({ setLinks: vi.fn(), refetchLinks: vi.fn(), linksError: false }));

vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgentSkillLinks: () => ({
    isError: hooks.linksError,
    refetch: hooks.refetchLinks,
    data: hooks.linksError ? undefined : [
      { agent_id: "ag1", skill_id: "on1", enabled: true, order: 0 },
      { agent_id: "ag1", skill_id: "off", enabled: false, order: 1 },
      { agent_id: "ag1", skill_id: "on2", enabled: true, order: 2 },
    ],
    isLoading: false,
  }),
  useSetAgentSkillLinks: () => ({ mutate: hooks.setLinks, isPending: false }),
}));

const skill = (id: string, name: string, enabled = true) => ({
  id, name, description: `${name} rule`, type: "rubric", source: "manual", body: "#", enabled, version: 1,
  agent_count: 1, created_at: "", updated_at: "",
});
vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({
    data: [skill("on1", "first-on"), skill("off", "switched-off"), skill("on2", "second-on"), skill("new", "unattached", false)],
    isLoading: false,
  }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(() => {
  cleanup();
  hooks.setLinks.mockClear();
  hooks.refetchLinks.mockClear();
  hooks.linksError = false;
});

const AGENT = { id: "ag1" } as Agent;

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <SkillsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

const row = (id: string) => screen.getByTestId(`skill-row-${id}`);
const grip = (id: string) => row(id).querySelector("[draggable]") as HTMLElement;
const toggle = (name: string) => within(screen.getByRole("group", { name: `Enable ${name} for this agent` })).getByRole("switch");

describe("Agent SkillsTab", () => {
  it("shows every workspace skill, enabled ones first, with a global-disabled marker", () => {
    renderTab();
    const names = screen.getAllByTestId(/skill-row-/).map((el) => el.getAttribute("data-testid"));
    expect(names).toEqual(["skill-row-on1", "skill-row-on2", "skill-row-off", "skill-row-new"]);
    expect(screen.getByText("2 of 4 enabled")).toBeInTheDocument();
    expect(within(row("new")).getByText("Disabled globally")).toBeInTheDocument();
  });

  it("lets only enabled skills be dragged, and a drop reorders the prompt", () => {
    renderTab();
    expect(grip("on1")).toHaveAttribute("draggable", "true");
    expect(grip("off")).toHaveAttribute("draggable", "false");
    expect(grip("new")).toHaveAttribute("draggable", "false");

    const dataTransfer = { setData: vi.fn(), effectAllowed: "" };
    fireEvent.dragStart(grip("on2"), { dataTransfer });
    fireEvent.dragOver(row("on1"), { dataTransfer });
    fireEvent.drop(row("on1"), { dataTransfer });
    expect(hooks.setLinks).toHaveBeenCalledWith({
      agentId: "ag1",
      links: [
        { skill_id: "on2", enabled: true, order: 0 },
        { skill_id: "off", enabled: false, order: 1 },
        { skill_id: "on1", enabled: true, order: 2 },
      ],
    });
  });

  it("ignores a drop onto a switched-off skill", () => {
    renderTab();
    fireEvent.dragStart(grip("on1"), { dataTransfer: { setData: vi.fn() } });
    fireEvent.drop(row("off"));
    expect(hooks.setLinks).not.toHaveBeenCalled();
  });

  it("switching on keeps an existing slot or attaches at the end; × detaches", () => {
    renderTab();
    fireEvent.click(toggle("switched-off"));
    expect(hooks.setLinks).toHaveBeenLastCalledWith({
      agentId: "ag1",
      links: [
        { skill_id: "on1", enabled: true, order: 0 },
        { skill_id: "off", enabled: true, order: 1 },
        { skill_id: "on2", enabled: true, order: 2 },
      ],
    });
    fireEvent.click(toggle("unattached"));
    expect(hooks.setLinks.mock.lastCall![0].links.at(-1)).toEqual({ skill_id: "new", enabled: true, order: 3 });
    fireEvent.click(screen.getByRole("button", { name: "Detach first-on" }));
    expect(hooks.setLinks.mock.lastCall![0].links.map((l: { skill_id: string }) => l.skill_id)).toEqual(["off", "on2"]);
  });

  it("filters by name and disables reordering while filtered", () => {
    renderTab();
    fireEvent.change(screen.getByRole("textbox", { name: "Filter skills…" }), { target: { value: "second" } });
    expect(screen.getAllByTestId(/skill-row-/)).toHaveLength(1);
    expect(grip("on2")).toHaveAttribute("draggable", "false");
    expect(screen.getByText("Clear the filter to reorder skills.")).toBeInTheDocument();
  });

  it("shows an error instead of an empty attachment list when the links fail to load", () => {
    hooks.linksError = true;
    renderTab();
    expect(screen.getByText("Couldn't load this agent's skills.")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry|try again/i }));
    expect(hooks.refetchLinks).toHaveBeenCalled();
  });
});
