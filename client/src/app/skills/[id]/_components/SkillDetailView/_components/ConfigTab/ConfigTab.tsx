"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useUpdateSkill } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { DeleteSkillModal } from "../../../../../_components/DeleteSkillModal";
import { SkillForm, isDraftDirty, isDraftValid, toDraft, type SkillDraft } from "@/components/skill-form";
import { s } from "./styles";

/** Edit metadata + body; a changed body is saved as the next immutable version. */
export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const router = useRouter();
  const update = useUpdateSkill();
  const original = React.useMemo(() => toDraft(skill), [skill]);
  const [draft, setDraft] = React.useState<SkillDraft>(original);
  const [deleting, setDeleting] = React.useState(false);
  const dirty = isDraftDirty(draft, original);

  const save = () =>
    update.mutate(
      { id: skill.id, patch: draft },
      {
        onSuccess: (saved) => toast.success(t("form.saved", { name: saved.name })),
        onError: (error) => toast.error(t("form.saveFailed", { message: error.message })),
      },
    );

  return (
    <div style={s.wrap}>
      {deleting && <DeleteSkillModal skill={skill} onClose={() => setDeleting(false)} onDeleted={() => router.push("/skills")} />}
      <div style={s.headingRow}>
        <div style={s.headingGroup}>
          <h2 style={s.heading}>{t("detail.configHeading")}</h2>
          <Badge icon="GitCommit" mono>
            {t("card.version", { version: skill.version })}
          </Badge>
        </div>
        <div style={s.enabledGroup}>
          <span style={s.enabledLabel}>{t("config.enabled")}</span>
          <Toggle
            ariaLabel={t("config.enabled")}
            on={skill.enabled}
            onChange={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })}
            size={16}
          />
        </div>
      </div>
      <SkillForm draft={draft} onChange={setDraft} bodyHint={t("config.bodyHint", { next: skill.version + 1 })} />
      <div style={s.actions}>
        <Button
          kind="primary"
          icon="Check"
          onClick={save}
          loading={update.isPending}
          disabled={!dirty || !isDraftValid(draft) || update.isPending}
        >
          {update.isPending ? t("form.saving") : t("form.save")}
        </Button>
        <Button kind="secondary" onClick={() => setDraft(original)} disabled={!dirty}>
          {t("form.cancel")}
        </Button>
      </div>
      <section style={s.danger}>
        <div>
          <div style={s.dangerTitle}>{t("config.dangerTitle")}</div>
          <div style={s.dangerBody}>{t("config.dangerBody")}</div>
        </div>
        <Button kind="danger" icon="Trash" onClick={() => setDeleting(true)}>
          {t("delete.confirm")}
        </Button>
      </section>
    </div>
  );
}
