/* OrderToggle — "Smart order" / "Original order" segmented control for the
   Files changed tab. Built from the shared Button primitive's `active` state
   so it matches the rest of the app's toggle chrome. */
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "./styles";

export type DiffOrder = "smart" | "original";

export function OrderToggle({
  order,
  onChange,
}: {
  order: DiffOrder;
  onChange: (order: DiffOrder) => void;
}) {
  const t = useTranslations("prReview");
  return (
    <div role="group" style={s.row}>
      <Button
        kind="tertiary"
        size="sm"
        active={order === "smart"}
        aria-pressed={order === "smart"}
        onClick={() => onChange("smart")}
      >
        {t("smartDiff.smartOrder")}
      </Button>
      <Button
        kind="tertiary"
        size="sm"
        active={order === "original"}
        aria-pressed={order === "original"}
        onClick={() => onChange("original")}
      >
        {t("smartDiff.originalOrder")}
      </Button>
    </div>
  );
}
