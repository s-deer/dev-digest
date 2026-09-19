/* /skills/:id — skill editor: Config / Preview / Versioning. Tab lives in ?tab=. */
"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { SkillDetailView } from "./_components/SkillDetailView";
import { TAB_KEYS, type SkillTabKey } from "./_components/SkillDetailView/constants";

export default function SkillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const requested = search.get("tab") ?? "";
  const tab: SkillTabKey = (TAB_KEYS as readonly string[]).includes(requested) ? (requested as SkillTabKey) : "config";
  return <SkillDetailView id={id} tab={tab} onTab={(next) => router.replace(`/skills/${id}?tab=${next}`)} />;
}
