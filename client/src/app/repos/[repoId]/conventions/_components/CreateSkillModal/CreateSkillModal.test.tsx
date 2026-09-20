import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import conventions from "../../../../../../../messages/en/conventions.json";
import skills from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../lib/toast";
import { CreateSkillModal } from "./CreateSkillModal";

const hooks = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: [{ id: "agent-1", name: "Review agent" }] }),
}));

vi.mock("@/lib/hooks/conventions", () => ({
  useCreateConventionSkill: () => ({ mutate: hooks.create, isPending: false }),
}));

afterEach(() => {
  cleanup();
  hooks.create.mockClear();
});

const draft = {
  name: "payments-api-conventions",
  description: "Flag house conventions in payments-api.",
  type: "convention" as const,
  enabled: true,
  body: "# payments-api-conventions\n\nUse async/await.",
  convention_ids: ["00000000-0000-0000-0000-000000000001"],
  evidence_files: ["src/api/users.ts"],
  existing_skill: null,
};

function renderModal() {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions, skills }}>
      <ToastProvider>
        <CreateSkillModal repoId="repo-1" repoName="acme/payments-api" draft={draft} onClose={vi.fn()} onCreated={vi.fn()} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("CreateSkillModal", () => {
  it("renders the design fields, previews markdown, and submits edited data", () => {
    renderModal();

    expect(screen.getByText(/Merged from/)).toBeInTheDocument();
    expect(screen.getByText("1 accepted conventions")).toBeInTheDocument();
    expect(screen.getByText("acme/payments-api")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Description" }), { target: { value: "Require async/await." } });
    fireEvent.change(screen.getByRole("textbox", { name: "payments-api-conventions.md" }), { target: { value: "# Edited convention" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("heading", { name: "Edited convention" })).toBeInTheDocument();

    fireEvent.click(screen.getByText("Choose an agent"));
    fireEvent.click(screen.getByRole("button", { name: "Review agent" }));
    const create = screen.getByRole("button", { name: "Create skill" });
    expect(create).toBeEnabled();
    fireEvent.click(create);

    expect(hooks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "payments-api-conventions",
        description: "Require async/await.",
        body: "# Edited convention",
        agent_id: "agent-1",
      }),
      expect.anything(),
    );
  });
});
