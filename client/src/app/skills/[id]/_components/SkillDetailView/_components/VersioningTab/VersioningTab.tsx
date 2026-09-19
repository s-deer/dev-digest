"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersions } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { ConfirmModal } from "../../../../../../../components/confirm-modal";
import { VersionDiff } from "./_components/VersionDiff";
import { s } from "./styles";

/** All body snapshots, newest first; older ones can be diffed against or restored as a new version. */
export function VersioningTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [diffVersion, setDiffVersion] = React.useState<number | null>(null);
  const [restoring, setRestoring] = React.useState<SkillVersion | null>(null);

  const confirmRestore = (version: SkillVersion) =>
    restore.mutate(
      { id: skill.id, version: version.version },
      {
        onSuccess: (restored) => {
          toast.success(t("versions.restored", { version: version.version, next: restored.version }));
          setRestoring(null);
          setDiffVersion(null);
        },
        onError: (error) => toast.error(error.message),
      },
    );

  if (isLoading) return <Skeleton height={220} />;
  if (isError || !versions) return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;

  return (
    <div style={s.wrap}>
      {restoring && (
        <ConfirmModal
          title={t("versions.restoreTitle", { version: restoring.version })}
          body={t("versions.restoreBody", { version: restoring.version, next: skill.version + 1 })}
          cancelLabel={t("form.cancel")}
          confirmLabel={t("versions.restoreConfirm")}
          confirmKind="primary"
          confirmIcon="History"
          pending={restore.isPending}
          onConfirm={() => confirmRestore(restoring)}
          onClose={() => setRestoring(null)}
        />
      )}
      <div style={s.header}>
        <h2 style={s.title}>{t("versions.title")}</h2>
        <Badge>{t("versions.count", { count: versions.length })}</Badge>
      </div>
      <p style={s.hint}>{t("versions.hint")}</p>
      <ul style={s.list}>
        {versions.map((version) => {
          const current = version.version === skill.version;
          const open = diffVersion === version.version;
          return (
            <li key={version.version} style={s.item(current)}>
              <div style={s.row}>
                <span className="mono" style={s.version(current)}>
                  {t("card.version", { version: version.version })}
                </span>
                <div style={s.meta}>
                  <div style={s.note}>{version.note ?? t("versions.noNote")}</div>
                  <div style={s.date}>{new Date(version.created_at).toLocaleString()}</div>
                </div>
                {current ? (
                  <Badge color="var(--ok)" bg="var(--ok-bg)" dot>
                    {t("versions.current")}
                  </Badge>
                ) : (
                  <div style={s.actions}>
                    <Button kind="ghost" size="sm" icon="Eye" onClick={() => setDiffVersion(open ? null : version.version)}>
                      {open ? t("versions.hideDiff") : t("versions.diff")}
                    </Button>
                    <Button kind="secondary" size="sm" icon="History" onClick={() => setRestoring(version)}>
                      {t("versions.restore")}
                    </Button>
                  </div>
                )}
              </div>
              {open && <VersionDiff from={version.body} to={skill.body} fromVersion={version.version} toVersion={skill.version} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
