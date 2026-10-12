/* Pure helpers for ProjectContextPicker: row ordering, filtering, reordering. */
import type { ProjectContextAttachmentItem, ProjectDocument } from "@devdigest/shared";

export interface PickerRow {
  path: string;
  attached: boolean;
  /** Set for available documents and for attached ones still in the listing. */
  doc: ProjectDocument | null;
  item: ProjectContextAttachmentItem | null;
}

/** Attached docs first, in prompt order (missing ones included), then the rest in listing order. */
export function buildRows(documents: ProjectDocument[], attached: ProjectContextAttachmentItem[]): PickerRow[] {
  const byPath = new Map(documents.map((d) => [d.path, d]));
  const attachedPaths = new Set(attached.map((a) => a.path));
  const head = attached.map<PickerRow>((item) => ({
    path: item.path,
    attached: true,
    doc: byPath.get(item.path) ?? null,
    item,
  }));
  const tail = documents
    .filter((d) => !attachedPaths.has(d.path))
    .map<PickerRow>((doc) => ({ path: doc.path, attached: false, doc, item: null }));
  return [...head, ...tail];
}

/** Case-insensitive path match; an empty query matches everything. */
export function matchesFilter(path: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q === "" || path.toLowerCase().includes(q);
}

/** A new array with the element at `from` moved to `to`; out-of-range moves are a no-op. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}

export function splitPath(path: string): { name: string; folder: string } {
  const i = path.lastIndexOf("/");
  return i < 0 ? { name: path, folder: "" } : { name: path.slice(i + 1), folder: path.slice(0, i + 1) };
}
