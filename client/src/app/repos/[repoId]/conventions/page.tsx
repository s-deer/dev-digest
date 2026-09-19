"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ConventionsView } from "./_components/ConventionsView";

export default function ConventionsPage() {
  const t = useTranslations("conventions");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const notFound = useRepoNotFound(repoId);
  const repoName = activeRepo?.full_name ?? repoId;

  return (
    <AppShell crumb={[{ label: t("breadcrumb.skillsLab") }, { label: t("breadcrumb.conventions") }, { label: repoName, mono: true }]}>
      {notFound ? <RepoNotFound /> : <ConventionsView repoId={repoId} repoName={repoName} branch={activeRepo?.default_branch ?? "main"} />}
    </AppShell>
  );
}
