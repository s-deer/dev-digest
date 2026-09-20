"use client";

import { useTranslations } from "next-intl";
import type { Agent } from "@devdigest/shared";
import { useDeleteAgent } from "../../../../../../lib/hooks/agents";
import { useToast } from "../../../../../../lib/toast";
import { ConfirmModal } from "../../../../../../components/confirm-modal";

/** Confirm / Cancel / × before an agent row is deleted from the database. */
export function DeleteAgentModal({ agent, onClose }: { agent: Pick<Agent, "id" | "name">; onClose: () => void }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const remove = useDeleteAgent();

  const confirm = () =>
    remove.mutate(agent.id, {
      onSuccess: () => {
        toast.success(t("delete.deleted", { name: agent.name }));
        onClose();
      },
      onError: (error) => toast.error(error.message),
    });

  return (
    <ConfirmModal
      title={t("delete.title")}
      body={t("delete.body", { name: agent.name })}
      cancelLabel={t("delete.cancel")}
      confirmLabel={t("delete.confirm")}
      confirmIcon="Trash"
      pending={remove.isPending}
      onConfirm={confirm}
      onClose={onClose}
    />
  );
}
