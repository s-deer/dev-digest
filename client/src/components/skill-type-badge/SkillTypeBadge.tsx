import { Badge } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPE_COLORS } from "./constants";

/** Colored type label; the caller passes the translated text for its namespace. */
export function SkillTypeBadge({ type, label }: { type: SkillType; label: string }) {
  const color = SKILL_TYPE_COLORS[type];
  return (
    <Badge color={color.fg} bg={color.bg}>
      {label}
    </Badge>
  );
}
