/* OrderToggle — "Smart order" / "Original order" segmented control for the
   Files changed tab. Custom buttons (diff.jsx:112-117) rather than the
   shared Button primitive: the active/inactive colours here (bg-elevated +
   text-primary vs. text-muted) don't match any of Button's existing kinds. */
"use client";

import { useTranslations } from "next-intl";
import { s, buttonFor } from "./styles";

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
    <div role="group" aria-label={t("smartDiff.orderLabel")} style={s.row}>
      <button
        type="button"
        aria-pressed={order === "smart"}
        onClick={() => onChange("smart")}
        style={buttonFor(order === "smart")}
      >
        {t("smartDiff.smartOrder")}
      </button>
      <button
        type="button"
        aria-pressed={order === "original"}
        onClick={() => onChange("original")}
        style={buttonFor(order === "original")}
      >
        {t("smartDiff.originalOrder")}
      </button>
    </div>
  );
}
