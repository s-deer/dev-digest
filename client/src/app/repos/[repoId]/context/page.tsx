"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useRepoNotFound } from "@/lib/repo-context";
import { ProjectContextView } from "./_components/ProjectContextView";

export default function ProjectContextPage() {
  const t = useTranslations("context");
  const { repoId } = useParams<{ repoId: string }>();
  const notFound = useRepoNotFound(repoId);

  return (
    <AppShell crumb={[{ label: t("breadcrumb.workspace") }, { label: t("title") }]}>
      {notFound ? <RepoNotFound /> : <ProjectContextView repoId={repoId} />}
    </AppShell>
  );
}
