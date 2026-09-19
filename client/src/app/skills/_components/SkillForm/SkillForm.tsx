"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Markdown, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPES } from "../constants";
import type { SkillDraft } from "./helpers";
import { s } from "./styles";

/** Controlled skill fields: name, directive description, type, Markdown body with a rendered preview. */
export function SkillForm({
  draft,
  onChange,
  bodyHint,
}: {
  draft: SkillDraft;
  onChange: (draft: SkillDraft) => void;
  bodyHint?: string;
}) {
  const t = useTranslations("skills");
  const [previewing, setPreviewing] = React.useState(false);
  const set = <K extends keyof SkillDraft>(key: K) => (value: SkillDraft[K]) => onChange({ ...draft, [key]: value });

  return (
    <div style={s.form}>
      <FormField label={t("form.name")} required>
        <TextInput value={draft.name} onChange={set("name")} placeholder={t("form.namePlaceholder")} aria-label={t("form.name")} mono />
      </FormField>
      <FormField label={t("form.description")} hint={t("form.descriptionHint")} required>
        <TextInput
          value={draft.description}
          onChange={set("description")}
          placeholder={t("form.descriptionPlaceholder")}
          aria-label={t("form.description")}
        />
      </FormField>
      <FormField label={t("form.type")}>
        <SelectInput
          value={draft.type}
          onChange={(value) => set("type")(value as SkillType)}
          options={SKILL_TYPES.map((type) => ({ value: type, label: t(`type.${type}`) }))}
        />
      </FormField>
      <FormField
        label={t("form.body")}
        hint={bodyHint ?? t("form.bodyHint")}
        required
        right={
          <div style={s.bodyTabs}>
            <Button size="sm" kind={previewing ? "ghost" : "secondary"} onClick={() => setPreviewing(false)}>
              {t("form.write")}
            </Button>
            <Button size="sm" kind={previewing ? "secondary" : "ghost"} onClick={() => setPreviewing(true)}>
              {t("form.preview")}
            </Button>
          </div>
        }
      >
        {previewing ? (
          <div style={s.preview}>
            {draft.body.trim() ? <Markdown>{draft.body}</Markdown> : <span style={s.muted}>{t("form.emptyPreview")}</span>}
          </div>
        ) : (
          <Textarea value={draft.body} onChange={set("body")} rows={14} mono />
        )}
      </FormField>
    </div>
  );
}
