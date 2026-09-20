"use client";

import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill } from "../../../../lib/hooks/skills";
import { useToast } from "../../../../lib/toast";
import { ConfirmModal } from "../../../../components/confirm-modal";

/** Confirm / Cancel / × — deleting also detaches the skill from every agent. */
export function DeleteSkillModal({
  skill,
  onClose,
  onDeleted,
}: {
  skill: Pick<Skill, "id" | "name" | "agent_count">;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const remove = useDeleteSkill();

  const confirm = () =>
    remove.mutate(skill.id, {
      onSuccess: () => {
        toast.success(t("delete.deleted", { name: skill.name }));
        onDeleted?.();
        onClose();
      },
      onError: (error) => toast.error(error.message),
    });

  return (
    <ConfirmModal
      title={t("delete.title")}
      body={t("delete.body", { name: skill.name, count: skill.agent_count })}
      cancelLabel={t("delete.cancel")}
      confirmLabel={t("delete.confirm")}
      confirmIcon="Trash"
      pending={remove.isPending}
      onConfirm={confirm}
      onClose={onClose}
    />
  );
}
