"use client";

import type { ComponentProps } from "react";
import { Button, Modal } from "@devdigest/ui";

type IconName = ComponentProps<typeof Button>["icon"];

/** Body paragraph + Cancel / Confirm footer shared by every confirm dialog. */
export function ConfirmModal({
  title,
  body,
  cancelLabel,
  confirmLabel,
  confirmKind = "danger",
  confirmIcon,
  pending = false,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  cancelLabel: string;
  confirmLabel: string;
  confirmKind?: "danger" | "primary";
  confirmIcon?: IconName;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      width={460}
      title={title}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button kind="secondary" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button kind={confirmKind} icon={confirmIcon} onClick={onConfirm} loading={pending} disabled={pending}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p style={{ padding: 24, margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "var(--text-secondary)" }}>
        {body}
      </p>
    </Modal>
  );
}
