import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { SkillsSidebar } from "./SkillsSidebar";

const SKILLS: Skill[] = [
  {
    id: "sk1", name: "boundary-cases", description: "Flag missing limit tests.", type: "rubric", source: "imported_file",
    body: "# Boundaries", enabled: true, version: 3, agent_count: 2, created_at: "", updated_at: "",
  },
  {
    id: "sk2", name: "breaking-change", description: "Flag changed route signatures.", type: "convention", source: "manual",
    body: "# Breaking", enabled: false, version: 1, agent_count: 0, created_at: "", updated_at: "",
  },
];

const callbacks = { select: vi.fn(), toggle: vi.fn(), create: vi.fn(), import: vi.fn(), refetch: vi.fn() };

function renderSidebar(props: Partial<ComponentProps<typeof SkillsSidebar>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillsSidebar
        skills={SKILLS}
        isLoading={false}
        isError={false}
        refetch={callbacks.refetch}
        activeId={null}
        onSelect={callbacks.select}
        onToggle={callbacks.toggle}
        onCreateDialog={callbacks.create}
        onImportDialog={callbacks.import}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  Object.values(callbacks).forEach((callback) => callback.mockClear());
});

describe("SkillsSidebar", () => {
  it("filters skills, selects a card, toggles it, and opens both Add Skill actions", () => {
    renderSidebar({ activeId: "sk1" });
    expect(screen.getByRole("button", { name: "boundary-cases" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("2 agents")).toBeInTheDocument();
    expect(screen.getByText("No agents")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "breaking-change" }));
    expect(callbacks.select).toHaveBeenCalledWith("sk2");

    fireEvent.click(screen.getByRole("switch", { name: "Enable boundary-cases" }));
    expect(callbacks.toggle).toHaveBeenCalledWith("sk1", false);

    fireEvent.change(screen.getByRole("textbox", { name: "Search skills…" }), { target: { value: "route" } });
    expect(screen.queryByText("boundary-cases")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "breaking-change" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add Skill" }));
    fireEvent.click(screen.getByRole("button", { name: "Create from scratch" }));
    expect(callbacks.create).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Add Skill" }));
    fireEvent.click(screen.getByRole("button", { name: "Import from file" }));
    expect(callbacks.import).toHaveBeenCalledOnce();
  });

  it("shows the collection and request failure states inline", () => {
    const { rerender } = renderSidebar({ skills: [] });
    expect(screen.getByText("No skills yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(callbacks.create).toHaveBeenCalledOnce();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <SkillsSidebar
          skills={undefined}
          isLoading={false}
          isError
          refetch={callbacks.refetch}
          activeId={null}
          onSelect={callbacks.select}
          onToggle={callbacks.toggle}
          onCreateDialog={callbacks.create}
          onImportDialog={callbacks.import}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load skills.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(callbacks.refetch).toHaveBeenCalledOnce();
  });
});
