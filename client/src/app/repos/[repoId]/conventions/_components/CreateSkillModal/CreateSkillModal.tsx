"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Icon, Modal, SearchableSelect, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import type { ConventionSkillDraft } from "@devdigest/shared";
import { isDraftDirty, isDraftValid, type SkillDraft } from "@/components/skill-form";
import { SKILL_TYPES } from "@/components/skill-form/constants";
import { useAgents } from "@/lib/hooks/agents";
import { useCreateConventionSkill } from "@/lib/hooks/conventions";
import { useToast } from "@/lib/toast";
import { s } from "../../styles";
import { SkillBodyEditor } from "./SkillBodyEditor";

export function CreateSkillModal({ repoId, repoName, draft, onClose, onCreated }: { repoId: string; repoName: string; draft: ConventionSkillDraft; onClose: () => void; onCreated: (id: string) => void }) {
  const t = useTranslations("conventions");
  const skillT = useTranslations("skills");
  const toast = useToast();
  const { data: agents } = useAgents();
  const create = useCreateConventionSkill(repoId);
  const [form, setForm] = React.useState<SkillDraft>({ name: draft.name, description: draft.description, type: draft.type, body: draft.body });
  const [enabled, setEnabled] = React.useState(draft.enabled);
  const [agentId, setAgentId] = React.useState("");
  const originalForm = { name: draft.name, description: draft.description, type: draft.type, body: draft.body };
  React.useEffect(() => {
    setForm({ name: draft.name, description: draft.description, type: draft.type, body: draft.body });
    setEnabled(draft.enabled);
    setAgentId("");
  }, [draft]);

  const close = () => {
    if ((isDraftDirty(form, originalForm) || enabled !== draft.enabled || agentId !== "") && !window.confirm(t("modal.discardConfirm"))) return;
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
  const filename = `${form.name || "skill"}.md`;
  const nextVersion = existing ? existing.version + 1 : 1;

  return (
    <Modal
      width={760}
      title={t("modal.title")}
      subtitle={draft.name}
      onClose={close}
      footer={
        <div style={s.modalFooter}>
          <span style={s.modalFooterStatus}>{t(existing ? "modal.savedVersion" : "modal.savedNew", { version: nextVersion })}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <Button kind="secondary" onClick={close}>{t("modal.cancel")}</Button>
            <Button kind="primary" icon="Sparkles" onClick={save} loading={create.isPending} disabled={create.isPending || !agentId || !isDraftValid(form)}>{t("modal.create")}</Button>
          </div>
        </div>
      }
    >
      <div style={s.modalBody}>
        <div style={s.banner}>
          <Icon.Wrench size={14} style={{ color: "var(--accent-text)", marginTop: 2, flexShrink: 0 }} />
          <div>
            {t("modal.bannerLead", { count: draft.convention_ids.length })} <strong style={{ color: "var(--text-primary)" }}>{t("modal.bannerAccepted", { count: draft.convention_ids.length })}</strong> {t("modal.bannerIn")} <span className="mono" style={{ color: "var(--accent-text)" }}>{repoName}</span>. {t("modal.bannerTail")}
            {existing && <div style={{ marginTop: 6 }}>{t("modal.updates", { from: existing.version, to: nextVersion })}</div>}
          </div>
        </div>

        <FormField label={skillT("form.name")} required>
          <TextInput value={form.name} onChange={(name) => setForm({ ...form, name })} aria-label={skillT("form.name")} mono />
        </FormField>
        <FormField label={skillT("form.description")} hint={t("modal.descriptionHint")} required>
          <TextInput value={form.description} onChange={(description) => setForm({ ...form, description })} aria-label={skillT("form.description")} />
        </FormField>
        <div style={s.modalGrid} className="dd-conventions-modal-grid">
          <FormField label={skillT("form.type")}>
            <SelectInput value={form.type} onChange={(type) => setForm({ ...form, type: type as SkillDraft["type"] })} options={SKILL_TYPES.map((type) => ({ value: type, label: skillT(`type.${type}`) }))} />
          </FormField>
          <FormField label={t("modal.enabled")} hint={t("modal.enabledHint")}>
            <Toggle on={enabled} onChange={setEnabled} />
          </FormField>
        </div>
        <FormField label={skillT("form.body")} hint={t("modal.bodyHint")} required>
          <SkillBodyEditor value={form.body} onChange={(body) => setForm({ ...form, body })} filename={filename} dirty={isDraftDirty(form, originalForm)} editLabel={t("modal.editor.edit")} previewLabel={t("modal.editor.preview")} />
        </FormField>
        <FormField label={t("modal.agent")} required>
          <SearchableSelect value={agentId} onChange={setAgentId} options={agentOptions} placeholder={t("modal.agentPlaceholder")} mono={false} />
        </FormField>
      </div>
    </Modal>
  );
}
