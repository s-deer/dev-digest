"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SearchableSelect, Toggle } from "@devdigest/ui";
import type { ConventionSkillDraft } from "@devdigest/shared";
import { SkillForm, isDraftValid, type SkillDraft } from "@/components/skill-form";
import { useAgents } from "@/lib/hooks/agents";
import { useCreateConventionSkill } from "@/lib/hooks/conventions";
import { useToast } from "@/lib/toast";
import { s } from "../../styles";

export function CreateSkillModal({ repoId, repoName, draft, onClose, onCreated }: { repoId: string; repoName: string; draft: ConventionSkillDraft; onClose: () => void; onCreated: (id: string) => void }) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const { data: agents } = useAgents();
  const create = useCreateConventionSkill(repoId);
  const [form, setForm] = React.useState<SkillDraft>({ name: draft.name, description: draft.description, type: draft.type, body: draft.body });
  const [enabled, setEnabled] = React.useState(draft.enabled);
  const [agentId, setAgentId] = React.useState("");
  React.useEffect(() => {
    setForm({ name: draft.name, description: draft.description, type: draft.type, body: draft.body });
    setEnabled(draft.enabled);
    setAgentId("");
  }, [draft]);

  const close = () => {
    if ((form.body !== draft.body || form.name !== draft.name || form.description !== draft.description) && !window.confirm(t("modal.discardConfirm"))) return;
    onClose();
  };
  const save = () => {
    if (!agentId || !isDraftValid(form)) return;
    create.mutate(
      { ...form, enabled, agent_id: agentId, convention_ids: draft.convention_ids, evidence_files: draft.evidence_files },
      {
        onSuccess: (skill) => {
          toast.success(t("toasts.created", { name: skill.name }));
          onCreated(skill.id);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };
  const existing = draft.existing_skill;
  const agentOptions = (agents ?? []).map((agent) => ({ value: agent.id, label: agent.name }));

  return (
    <Modal width={760} title={t("modal.title")} subtitle={draft.name} onClose={close} footer={<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><Button kind="secondary" onClick={close}>{t("modal.cancel")}</Button><Button kind="primary" onClick={save} loading={create.isPending} disabled={create.isPending || !agentId || !isDraftValid(form)}>{t("modal.create")}</Button></div>}>
      <div style={{ padding: 24 }}>
        <div style={s.banner}>
          {t("modal.banner", { count: draft.convention_ids.length, repo: repoName })}
          {existing && <div style={{ marginTop: 6 }}>{t("modal.updates", { from: existing.version, to: existing.version + 1 })}</div>}
        </div>
        <SkillForm draft={form} onChange={setForm} bodyHint={t("modal.bodyHint")} />
        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          <FormField label={t("modal.enabled")}><Toggle on={enabled} onChange={setEnabled} /></FormField>
          <FormField label={t("modal.agent")} required>
            <SearchableSelect value={agentId} onChange={setAgentId} options={agentOptions} placeholder={t("modal.agentPlaceholder")} mono={false} />
          </FormField>
        </div>
      </div>
    </Modal>
  );
}
