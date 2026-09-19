import { useTranslations } from "next-intl";
import { buildLineDiff } from "./helpers";
import { s } from "./styles";

const SIGN = { add: "+", del: "-", same: " " } as const;

/** Old snapshot → current body, one row per line. */
export function VersionDiff({ from, to, fromVersion, toVersion }: { from: string; to: string; fromVersion: number; toVersion: number }) {
  const t = useTranslations("skills");
  const lines = buildLineDiff(from, to);
  const changed = lines.some((line) => line.kind !== "same");
  return (
    <div style={s.wrap}>
      <div style={s.title}>{t("versions.diffTitle", { from: fromVersion, to: toVersion })}</div>
      {changed ? (
        <pre className="mono" style={s.lines} data-testid="version-diff">
          {lines.map((line, index) => (
            <div key={index} style={s.line(line.kind)} data-kind={line.kind}>
              <span style={s.sign(line.kind)}>{SIGN[line.kind]}</span>
              <span>{line.text}</span>
            </div>
          ))}
        </pre>
      ) : (
        <div style={s.empty}>{t("versions.noChanges")}</div>
      )}
    </div>
  );
}
