import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../lib/toast";

const mocks = vi.hoisted(() => ({ push: vi.fn(), update: vi.fn(), remove: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
const SKILLS: Skill[] = [
  {
    id: "sk1", name: "boundary-cases", description: "Flag missing limit tests.", type: "rubric", source: "imported_file",
    body: "# Boundaries\nTest 0, 1 and max.", enabled: true, version: 3, agent_count: 2, created_at: "", updated_at: "",
  },
  {
    id: "sk2", name: "breaking-change", description: "Flag changed route signatures.", type: "convention", source: "manual",
    body: "# Breaking", enabled: false, version: 1, agent_count: 0, created_at: "", updated_at: "",
  },
];

vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: mocks.update, isPending: false }),
  useCreateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSkill: () => ({ mutate: mocks.remove, isPending: false }),
  useSkillImportPreview: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false }),
}));

import { SkillsView } from "./SkillsView";

afterEach(() => {
  cleanup();
  Object.values(mocks).forEach((mock) => mock.mockClear());
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <SkillsView />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

const card = (name: string) => screen.getByText(name).closest("article") as HTMLElement;

describe("SkillsView", () => {
  it("renders a card per skill with type, source, version, agent count and a toggle", () => {
    renderView();
    const tile = card("boundary-cases");
    expect(within(tile).getByText("Flag missing limit tests.")).toBeInTheDocument();
    expect(within(tile).getByText("rubric")).toBeInTheDocument();
    expect(within(tile).getByText("Imported")).toBeInTheDocument();
    expect(within(tile).getByText("v3")).toBeInTheDocument();
    expect(within(tile).getByText("2 agents")).toBeInTheDocument();
    expect(within(card("breaking-change")).getByText("No agents")).toBeInTheDocument();

    fireEvent.click(within(tile).getByRole("switch"));
    expect(mocks.update).toHaveBeenCalledWith({ id: "sk1", patch: { enabled: false } });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens a side preview with the rendered body; Open navigates to the skill page", () => {
    renderView();
    fireEvent.click(card("boundary-cases"));
    const drawer = screen.getByRole("dialog");
    expect(within(drawer).getByRole("heading", { name: "Boundaries" })).toBeInTheDocument();
    fireEvent.click(within(drawer).getByRole("button", { name: "Open" }));
    expect(mocks.push).toHaveBeenCalledWith("/skills/sk1");
  });

  it("offers create and import from the Add Skill menu; create opens the form modal", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Add Skill" }));
    expect(screen.getByText("Import from file")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Create from scratch"));
    expect(screen.getByRole("dialog")).toHaveTextContent("Create a skill");
    expect(screen.getByText(/Write it as a directive/)).toBeInTheDocument();
  });

  it("confirms deletion in a modal and deletes only on confirm", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Delete boundary-cases" }));
    const modal = screen.getByRole("dialog");
    expect(modal).toHaveTextContent('Delete "boundary-cases"? It will be detached from 2 agents.');
    fireEvent.click(within(modal).getByRole("button", { name: "Cancel" }));
    expect(mocks.remove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete boundary-cases" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(mocks.remove).toHaveBeenCalledWith("sk1", expect.anything());
  });

  it("filters cards by search", () => {
    renderView();
    fireEvent.change(screen.getByRole("textbox", { name: "Search skills…" }), { target: { value: "route" } });
    expect(screen.queryByText("boundary-cases")).not.toBeInTheDocument();
    expect(screen.getByText("breaking-change")).toBeInTheDocument();
  });
});
