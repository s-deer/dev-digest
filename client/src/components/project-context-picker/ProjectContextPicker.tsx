/* ProjectContextPicker — attach/order repository docs. Presentational: the
   owner (agent or skill tab) supplies the listing and saved state and gets the
   whole new ordered path list through `onChange`. Used by two tabs. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, Icon } from "@devdigest/ui";
import type { InheritedProjectDoc, ProjectContextAttachmentItem, ProjectDocument } from "@devdigest/shared";
import { buildRows, matchesFilter, moveItem } from "./helpers";
import { DocumentRow } from "./_components/DocumentRow";
import { PreviewDialog } from "./_components/PreviewDialog";
import { s } from "./styles";

export interface ProjectContextPickerProps {
  /** Active repository; null shows the "select a repository" prompt. */
  repoId: string | null;
  documents: ProjectDocument[];
  /** Saved attachments in prompt order. */
  attached: ProjectContextAttachmentItem[];
  /** Read-only rows coming from the agent's skills. */
  inherited?: InheritedProjectDoc[];
  /** True while a save is in flight. */
  disabled?: boolean;
  onChange: (paths: string[]) => void;
}

const NO_INHERITED: InheritedProjectDoc[] = [];

export function ProjectContextPicker({
  repoId,
  documents,
  attached,
  inherited = NO_INHERITED,
  disabled = false,
  onChange,
}: ProjectContextPickerProps) {
  const t = useTranslations("context");
  const [filter, setFilter] = React.useState("");
  const [preview, setPreview] = React.useState<string | null>(null);
  const [dragPath, setDragPath] = React.useState<string | null>(null);
  const trigger = React.useRef<HTMLElement | null>(null);

  const rows = React.useMemo(() => buildRows(documents, attached), [documents, attached]);
  const attachedPaths = React.useMemo(() => attached.map((a) => a.path), [attached]);

  const closePreview = React.useCallback(() => {
    setPreview(null);
    trigger.current?.focus();
  }, []);

  if (repoId == null) {
    return <EmptyState icon="Folder" title={t("picker.noRepo.title")} body={t("picker.noRepo.body")} />;
  }

  const visible = rows.filter((r) => matchesFilter(r.path, filter));
  const visibleInherited = inherited.filter((r) => matchesFilter(r.path, filter));

  const toggle = (path: string, on: boolean) =>
    onChange(on ? [...attachedPaths, path] : attachedPaths.filter((p) => p !== path));
  const move = (path: string, delta: -1 | 1) => {
    const from = attachedPaths.indexOf(path);
    onChange(moveItem(attachedPaths, from, from + delta));
  };
  const drop = (target: string) => {
    if (dragPath != null && dragPath !== target) {
      onChange(moveItem(attachedPaths, attachedPaths.indexOf(dragPath), attachedPaths.indexOf(target)));
    }
    setDragPath(null);
  };

  return (
    <div style={s.wrap}>
      <label style={s.filter}>
        <Icon.Search size={14} />
        <input
          type="search"
          style={s.filterInput}
          value={filter}
          placeholder={t("picker.filterPlaceholder")}
          aria-label={t("picker.filterLabel")}
          onChange={(e) => setFilter(e.target.value)}
        />
      </label>

      {visible.length === 0 && visibleInherited.length === 0 ? (
        <div style={s.muted}>{documents.length === 0 && attached.length === 0 ? t("picker.noDocuments") : t("picker.noMatch")}</div>
      ) : (
        <ul style={s.list}>
          {visibleInherited.map((r) => (
            <DocumentRow
              key={`inherited:${r.via_skill_id}:${r.path}`}
              path={r.path}
              type={documents.find((d) => d.path === r.path)?.type ?? null}
              tokens={r.tokens}
              checked
              missing={r.missing}
              overCap={r.over_cap}
              inheritedVia={r.via_skill_name}
              order={null}
              dragging={false}
              disabled
              onToggle={() => {}}
              onMove={() => {}}
              onPreview={(el) => {
                trigger.current = el;
                setPreview(r.path);
              }}
              onDetach={() => {}}
              onDragStart={() => {}}
              onDragOver={() => {}}
              onDrop={() => {}}
            />
          ))}
          {visible.map((r) => {
            const index = r.attached ? attachedPaths.indexOf(r.path) : -1;
            return (
              <DocumentRow
                key={r.path}
                path={r.path}
                type={r.doc?.type ?? null}
                tokens={r.item?.tokens ?? r.doc?.tokens ?? 0}
                checked={r.attached}
                missing={r.item?.missing ?? false}
                overCap={r.item?.over_cap ?? r.doc?.over_cap ?? false}
                inheritedVia={null}
                order={r.attached ? { index, count: attachedPaths.length } : null}
                dragging={dragPath === r.path}
                disabled={disabled}
                onToggle={() => toggle(r.path, !r.attached)}
                onMove={(delta) => move(r.path, delta)}
                onPreview={(el) => {
                  trigger.current = el;
                  setPreview(r.path);
                }}
                onDetach={() => toggle(r.path, false)}
                onDragStart={() => setDragPath(r.path)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drop(r.path)}
              />
            );
          })}
        </ul>
      )}

      {preview != null && <PreviewDialog repoId={repoId} path={preview} onClose={closePreview} />}
    </div>
  );
}
