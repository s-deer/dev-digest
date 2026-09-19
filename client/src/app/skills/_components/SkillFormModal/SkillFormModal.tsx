"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { Skill, SkillImportPreview } from "@devdigest/shared";
import { useCreateSkill, useUpdateSkill } from "../../../../lib/hooks/skills";
import { useToast } from "../../../../lib/toast";
import { EMPTY_DRAFT, SkillForm, isDraftValid, toDraft, type SkillDraft } from "@/components/skill-form";

export type SkillFormMode =
  | { kind: "create" }
  | { kind: "edit"; skill: Skill }
  | { kind: "import"; preview: SkillImportPreview; filename: string };

function initialDraft(mode: SkillFormMode): SkillDraft {
  if (mode.kind === "edit") return toDraft(mode.skill);
  if (mode.kind === "import") return toDraft(mode.preview);
  return EMPTY_DRAFT;
}

/** Create, edit, or confirm-and-save an imported skill. Nothing is persisted until Save. */
export function SkillFormModal({
  mode,
  onClose,
  onSaved,
}: {
  mode: SkillFormMode;
  onClose: () => void;
  onSaved?: (skill: Skill) => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const [draft, setDraft] = React.useState<SkillDraft>(() => initialDraft(mode));
  const saving = create.isPending || update.isPending;

  const done = (skill: Skill, key: "form.created" | "form.saved") => {
    toast.success(t(key, { name: skill.name }));
    onSaved?.(skill);
    onClose();
  };
  const failed = (error: Error) => toast.error(t("form.saveFailed", { message: error.message }));

  const save = () => {
    if (!isDraftValid(draft)) return;
    if (mode.kind === "edit") {
      update.mutate({ id: mode.skill.id, patch: draft }, { onSuccess: (skill) => done(skill, "form.saved"), onError: failed });
      return;
    }
    create.mutate(
      mode.kind === "import"
        ? { ...draft, source: "imported_file", version_note: t("import.versionNote", { file: mode.filename }) }
        : { ...draft, source: "manual" },
      { onSuccess: (skill) => done(skill, "form.created"), onError: failed },
    );
  };

  const title = mode.kind === "edit" ? t("form.editTitle") : mode.kind === "import" ? t("form.importTitle") : t("form.createTitle");

  return (
    <Modal
      width={820}
      title={title}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button kind="secondary" onClick={onClose}>
            {t("form.cancel")}
          </Button>
          <Button kind="primary" icon="Check" onClick={save} loading={saving} disabled={saving || !isDraftValid(draft)}>
            {saving ? t("form.saving") : t("form.save")}
          </Button>
        </div>
      }
    >
      <div style={{ padding: 24 }}>
        <SkillForm draft={draft} onChange={setDraft} />
      </div>
    </Modal>
  );
}
