import { diffLines } from "diff";

export type DiffLine = { kind: "add" | "del" | "same"; text: string };

/** Line-level diff from an old body to the current one. */
export function buildLineDiff(from: string, to: string): DiffLine[] {
  return diffLines(from, to).flatMap((part) => {
    const kind: DiffLine["kind"] = part.added ? "add" : part.removed ? "del" : "same";
    const lines = part.value.replace(/\n$/, "").split("\n");
    return lines.map((text) => ({ kind, text }));
  });
}
