/* PreviewDialog — read-only Markdown preview of one project document. Focus
   moves into the dialog on open, Escape closes it, and the caller restores
   focus to the trigger. Remote images are blocked: the document is untrusted. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Markdown, Modal, Skeleton } from "@devdigest/ui";
import { useProjectDocument } from "@/lib/hooks/project-context";
import { s } from "../../styles";

export function PreviewDialog({ repoId, path, onClose }: { repoId: string; path: string; onClose: () => void }) {
  const t = useTranslations("context");
  const ref = React.useRef<HTMLDivElement>(null);
  const doc = useProjectDocument(repoId, path);

  React.useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div ref={ref} tabIndex={-1} style={s.dialogFocus}>
      <Modal width={820} title={<span className="mono">{path}</span>} onClose={onClose}>
        <div style={s.previewBody}>
          {doc.isLoading ? (
            <Skeleton height={160} />
          ) : doc.isError || !doc.data ? (
            <ErrorState body={t("picker.previewLoadError")} onRetry={() => doc.refetch()} />
          ) : (
            <>
              <div style={s.previewMeta}>{t("picker.tokens", { tokens: doc.data.tokens })}</div>
              <Markdown blockRemoteImages>{doc.data.content}</Markdown>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
