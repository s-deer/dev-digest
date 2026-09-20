"use client";

import React from "react";
import { Button, Icon, Markdown } from "@devdigest/ui";
import { s } from "../../styles";

export function SkillBodyEditor({
  value,
  onChange,
  filename,
  dirty,
  editLabel,
  previewLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  filename: string;
  dirty: boolean;
  editLabel: string;
  previewLabel: string;
}) {
  const [previewing, setPreviewing] = React.useState(false);
  const lines = Math.max(1, value.split("\n").length);
  const tokenCount = value.trim() ? value.trim().split(/\s+/).length : 0;

  return (
    <div style={s.editor}>
      <div style={s.editorHeader}>
        <div style={s.editorFile}>
          <Icon.FileText size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{filename}</span>
          {dirty && <span style={s.editorBadge}>unsaved</span>}
        </div>
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          <Button size="sm" kind={previewing ? "ghost" : "secondary"} onClick={() => setPreviewing(false)}>{editLabel}</Button>
          <Button size="sm" kind={previewing ? "secondary" : "ghost"} onClick={() => setPreviewing(true)}>{previewLabel}</Button>
        </div>
        <span className="mono tnum" style={s.editorCount}>{tokenCount} tokens</span>
      </div>
      {previewing ? (
        <div style={s.editorPreview}>
          {value.trim() ? <Markdown>{value}</Markdown> : null}
        </div>
      ) : (
        <div style={s.editorSurface}>
          <div aria-hidden="true" className="mono tnum" style={s.editorLines}>
            {Array.from({ length: lines }, (_, index) => <div key={index}>{index + 1}</div>)}
          </div>
          <textarea
            aria-label={filename}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
            style={s.editorTextarea}
          />
        </div>
      )}
    </div>
  );
}
