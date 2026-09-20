"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, Markdown, Modal } from "@devdigest/ui";
import type { SkillImportPreview } from "@devdigest/shared";
import { SkillTypeBadge } from "../../../../components/skill-type-badge";
import { useSkillImportPreview } from "../../../../lib/hooks/skills";
import { readFileAsBase64 } from "./helpers";
import { s } from "./styles";

/**
 * Step 1 of an import: pick a .md/.zip, let the server extract the Markdown
 * core, and show it rendered together with every file that was dropped.
 * Continue hands the preview to the save form; nothing is stored here.
 */
export function ImportSkillModal({
  onClose,
  onContinue,
}: {
  onClose: () => void;
  onContinue: (preview: SkillImportPreview, filename: string) => void;
}) {
  const t = useTranslations("skills");
  const parse = useSkillImportPreview();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [filename, setFilename] = React.useState("");
  const [readError, setReadError] = React.useState(false);
  const preview = parse.data;

  const choose = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFilename(file.name);
    setReadError(false);
    parse.reset();
    try {
      parse.mutate({ filename: file.name, content_base64: await readFileAsBase64(file) });
    } catch {
      setReadError(true);
    }
  };

  return (
    <Modal
      width={820}
      title={t("import.title")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button kind="secondary" onClick={onClose}>
            {t("import.cancel")}
          </Button>
          <Button kind="primary" icon="ArrowRight" disabled={!preview} onClick={() => preview && onContinue(preview, filename)}>
            {t("import.continue")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.trust} role="note">
          <Icon.AlertTriangle size={16} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={s.trustTitle}>{t("import.trustTitle")}</div>
            {t("import.trust")}
          </div>
        </div>

        <div style={s.picker}>
          <input
            ref={inputRef}
            type="file"
            accept=".md,.markdown,.zip,text/markdown,application/zip"
            onChange={choose}
            style={{ display: "none" }}
            data-testid="skill-import-input"
          />
          <Button kind="secondary" icon="Upload" onClick={() => inputRef.current?.click()} loading={parse.isPending}>
            {t("import.choose")}
          </Button>
          {filename ? <span className="mono" style={s.muted}>{filename}</span> : <span style={s.muted}>{t("import.accept")}</span>}
        </div>

        {parse.isPending && <p style={s.muted}>{t("import.parsing")}</p>}
        {readError && <p role="alert" style={s.error}>{t("import.readFailed")}</p>}
        {parse.isError && <p role="alert" style={s.error}>{t("import.failed", { message: parse.error.message })}</p>}

        {preview && (
          <>
            <div style={s.meta}>
              <span className="mono" style={s.name}>{preview.name}</span>
              <SkillTypeBadge type={preview.type} label={t(`type.${preview.type}`)} />
              <Badge icon="FileText">{t("import.coreFile", { file: preview.source_file })}</Badge>
            </div>
            {preview.description && <p style={s.description}>{preview.description}</p>}
            <div style={s.rendered}>
              <Markdown>{preview.body}</Markdown>
            </div>
            {preview.warnings.map((warning) => (
              <p key={warning} role="alert" style={s.error}>{warning}</p>
            ))}
            {preview.ignored_files.length > 0 && (
              <div>
                <div style={s.sectionTitle}>{t("import.ignoredTitle")}</div>
                <ul style={s.ignored}>
                  {preview.ignored_files.map((file) => (
                    <li key={file} className="mono">{file}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
