"use client";

import React from "react";
import { useRouter } from "next/navigation";
import type { Skill } from "@devdigest/shared";
import { useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { ImportSkillModal } from "../ImportSkillModal";
import { SkillFormModal, type SkillFormMode } from "../SkillFormModal";
import { SkillsSidebar } from "../SkillsSidebar";
import type { SkillTabKey } from "../../[id]/_components/SkillDetailView/constants";
import { s } from "./styles";

type Dialog = { kind: "form"; mode: SkillFormMode } | { kind: "import" } | null;

/** Shared master pane and modal orchestration for the skills routes. */
export function SkillsWorkspace({
  activeId,
  activeTab,
  children,
}: {
  activeId: string | null;
  activeTab?: SkillTabKey;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const close = () => setDialog(null);

  const select = (id: string) => {
    const tab = activeTab ? `?tab=${activeTab}` : "";
    router.push(`/skills/${id}${tab}`);
  };
  const onSaved = (skill: Skill) => router.push(`/skills/${skill.id}`);

  return (
    <>
      {dialog?.kind === "form" && <SkillFormModal mode={dialog.mode} onClose={close} onSaved={onSaved} />}
      {dialog?.kind === "import" && (
        <ImportSkillModal
          onClose={close}
          onContinue={(preview, filename) => setDialog({ kind: "form", mode: { kind: "import", preview, filename } })}
        />
      )}
      <div className="dd-skills-workspace" data-selected={activeId ? "true" : "false"} style={s.workspace}>
        <SkillsSidebar
          skills={skills}
          isLoading={isLoading}
          isError={isError}
          refetch={refetch}
          activeId={activeId}
          onSelect={select}
          onToggle={(id, enabled) => update.mutate({ id, patch: { enabled } })}
          onCreateDialog={() => setDialog({ kind: "form", mode: { kind: "create" } })}
          onImportDialog={() => setDialog({ kind: "import" })}
        />
        {children}
      </div>
    </>
  );
}
