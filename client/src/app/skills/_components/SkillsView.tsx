"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, ErrorState, FormField, Modal, SelectInput, Skeleton, TextInput, Textarea, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { AppShell } from "../../../components/app-shell";
import { useCreateSkill, useDeleteSkill, useSkillImportPreview, useSkills, useUpdateSkill } from "../../../lib/hooks/skills";
import { useToast } from "../../../lib/toast";

const TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

type EditorMode = "create" | "edit" | "import" | null;

function SkillForm({ skill, initial, source = "manual", onClose }: { skill?: Skill; initial?: Pick<Skill, "name" | "description" | "type" | "body">; source?: "manual" | "extracted"; onClose: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const [name, setName] = React.useState(skill?.name ?? initial?.name ?? "");
  const [description, setDescription] = React.useState(skill?.description ?? initial?.description ?? "");
  const [type, setType] = React.useState<SkillType>(skill?.type ?? initial?.type ?? "custom");
  const [body, setBody] = React.useState(skill?.body ?? initial?.body ?? "");
  const saving = create.isPending || update.isPending;

  const save = () => {
    if (!name.trim() || !description.trim() || !body.trim()) return;
    if (skill) {
      update.mutate(
        { id: skill.id, patch: { name, description, type, body } },
        { onSuccess: () => toast.success(t("preview.save")) },
      );
      return;
    }
    create.mutate(
      { name, description, type, body, source },
      {
        onSuccess: (created) => {
          toast.success(t("file.success", { name: created.name }));
          onClose();
        },
      },
    );
  };

  return (
    <div style={{ display: "grid", gap: 4, padding: 24 }}>
      <FormField label={t("editor.name")} required>
        <TextInput value={name} onChange={setName} placeholder={t("editor.namePlaceholder")} />
      </FormField>
      <FormField label={t("editor.description")} hint={t("editor.descriptionHint")} required>
        <TextInput value={description} onChange={setDescription} placeholder={t("editor.descriptionPlaceholder")} />
      </FormField>
      <FormField label={t("editor.type")}>
        <SelectInput value={type} onChange={(value) => setType(value as SkillType)} options={[...TYPES]} />
      </FormField>
      <FormField label={t("editor.body")} required>
        <Textarea value={body} onChange={setBody} rows={16} mono />
      </FormField>
      <div style={{ display: "flex", gap: 10 }}>
        <Button kind="primary" icon="Check" onClick={save} disabled={saving || !name.trim() || !description.trim() || !body.trim()}>
          {saving ? t("editor.saving") : t("editor.save")}
        </Button>
        <Button kind="secondary" onClick={onClose}>{t("editor.cancel")}</Button>
      </div>
    </div>
  );
}

function MarkdownImport({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const preview = useSkillImportPreview();
  const [fileName, setFileName] = React.useState("");
  const [markdown, setMarkdown] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const chooseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setMarkdown(text);
    setConfirmed(false);
    preview.mutate(text);
  };

  if (confirmed && preview.data) {
    return <SkillForm source="extracted" onClose={onClose} initial={{
      name: preview.data.name, description: t("file.importDescription"), type: "custom", body: preview.data.body,
    }} />;
  }

  return (
    <div style={{ padding: 24 }}>
      <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>{t("file.trust")}</p>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--accent-text)" }}>
        <input ref={inputRef} type="file" accept=".md,text/markdown" onChange={chooseFile} style={{ display: "none" }} />
        <Button kind="secondary" icon="Upload" onClick={() => inputRef.current?.click()}>{t("file.choose")}</Button>
        {fileName && <span className="mono" style={{ fontSize: 12 }}>{fileName}</span>}
      </div>
      {preview.isPending && <p style={{ color: "var(--text-muted)", marginTop: 16 }}>{t("file.importing")}</p>}
      {preview.isError && <p role="alert" style={{ color: "var(--crit)", marginTop: 16 }}>{t("drawer.importFailed")}</p>}
      {preview.data && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>{t("file.preview")}</h3>
          <Card style={{ maxHeight: 360, overflow: "auto" }}>
            <strong>{preview.data.name}</strong>
            <pre className="mono" style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 12 }}>{preview.data.body}</pre>
          </Card>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <Button kind="primary" icon="Check" onClick={() => setConfirmed(true)} disabled={!markdown}>{t("file.confirm")}</Button>
            <Button kind="secondary" onClick={onClose}>{t("editor.cancel")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SkillsView() {
  const t = useTranslations("skills");
  const { data: skills, isLoading, isError, error, refetch } = useSkills();
  const update = useUpdateSkill();
  const remove = useDeleteSkill();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [mode, setMode] = React.useState<EditorMode>(null);
  const selected = skills?.find((skill) => skill.id === selectedId) ?? null;
  const visible = (skills ?? []).filter((skill) => `${skill.name} ${skill.description}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      <main style={{ padding: 28, maxWidth: 1480, margin: "0 auto" }}>
        <header style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 22, flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}><h1 style={{ fontSize: 24 }}>{t("page.heading")}</h1></div>
          <TextInput value={query} onChange={setQuery} placeholder={t("page.searchPlaceholder")} aria-label={t("page.searchPlaceholder")} />
          <Button kind="secondary" icon="Upload" onClick={() => setMode("import")}>{t("page.importMarkdown")}</Button>
          <Button kind="primary" icon="Plus" onClick={() => setMode("create")}>{t("page.createSkill")}</Button>
        </header>
        {mode && (
          <Modal
            width={820}
            title={mode === "import" ? t("page.importMarkdown") : t(mode === "edit" ? "editor.editTitle" : "editor.createTitle")}
            onClose={() => setMode(null)}
          >
            {mode === "import" ? <MarkdownImport onClose={() => setMode(null)} /> : <SkillForm skill={mode === "edit" ? selected ?? undefined : undefined} onClose={() => setMode(null)} />}
          </Modal>
        )}
        {isLoading && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 14 }}>{[1, 2, 3].map((key) => <Skeleton key={key} height={160} />)}</div>}
        {isError && <ErrorState title={t("page.loadError")} body={error.message} onRetry={() => refetch()} />}
        {!isLoading && !isError && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "start" }}>
            <div style={{ flex: "1 1 640px", minWidth: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
              {visible.map((skill) => (
                <Card key={skill.id} hover onClick={() => setSelectedId(skill.id)} style={{ borderColor: selectedId === skill.id ? "var(--accent)" : undefined, opacity: skill.enabled ? 1 : 0.62 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "start" }}>
                    <strong style={{ flex: 1 }}>{skill.name}</strong>
                    <div onClick={(event) => event.stopPropagation()}><Toggle on={skill.enabled} onChange={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })} size={15} /></div>
                  </div>
                  <div style={{ display: "flex", gap: 8, margin: "12px 0" }}><Badge color="var(--accent-text)">{t(`listItem.type.${skill.type}`)}</Badge><Badge color="var(--text-muted)">{skill.source}</Badge></div>
                  <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.45, margin: 0 }}>{skill.description}</p>
                </Card>
              ))}
              {visible.length === 0 && <p style={{ color: "var(--text-muted)" }}>{t("page.empty.body")}</p>}
            </div>
            <Card style={{ position: "sticky", top: 20, flex: "1 1 320px", minWidth: 0 }}>
              {selected ? (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}><h2 style={{ fontSize: 18, flex: 1 }}>{selected.name}</h2><Badge color="var(--text-muted)">v{selected.version}</Badge></div>
                  <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{selected.description}</p>
                  <pre className="mono" style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "var(--bg-hover)", padding: 12, borderRadius: 6, maxHeight: 420, overflow: "auto" }}>{selected.body}</pre>
                  <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                    <Button kind="secondary" icon="Edit" onClick={() => setMode("edit")}>{t("preview.edit")}</Button>
                    <Button kind="secondary" icon="Trash" onClick={() => { if (window.confirm(t("editor.deleteConfirm", { name: selected.name }))) { remove.mutate(selected.id); setSelectedId(null); } }} disabled={remove.isPending}>{t("editor.delete")}</Button>
                  </div>
                </div>
              ) : <p style={{ color: "var(--text-muted)" }}>{t("page.selectPrompt.body")}</p>}
            </Card>
          </div>
        )}
      </main>
    </AppShell>
  );
}
