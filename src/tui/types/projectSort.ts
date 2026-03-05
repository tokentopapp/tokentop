import type { SortFieldDef } from "./sort.ts";
import { buildShortcutMap } from "./sort.ts";

export type ProjectSortField =
  | "project"
  | "cost"
  | "tokens"
  | "sessions"
  | "cache"
  | "cpr"
  | "activity";

export const PROJECT_SORT_FIELDS: readonly SortFieldDef<ProjectSortField>[] = [
  { id: "project", label: "Project", shortcutKey: "P", defaultDirection: "asc" },
  { id: "cost", label: "Cost", shortcutKey: "C", defaultDirection: "desc" },
  { id: "tokens", label: "Tokens", shortcutKey: "K", defaultDirection: "desc" },
  { id: "sessions", label: "Sessions", shortcutKey: "S", defaultDirection: "desc" },
  { id: "cache", label: "Cache", shortcutKey: "H", defaultDirection: "desc" },
  { id: "cpr", label: "$/Req", shortcutKey: "R", defaultDirection: "desc" },
  { id: "activity", label: "Activity", shortcutKey: "A", defaultDirection: "desc" },
] as const;

/** Map from lowercase shortcut key → ProjectSortField */
export const PROJECT_SHORTCUT_TO_FIELD: ReadonlyMap<string, ProjectSortField> =
  buildShortcutMap(PROJECT_SORT_FIELDS);

export function getProjectSortFieldDef(field: ProjectSortField): SortFieldDef<ProjectSortField> {
  const def = PROJECT_SORT_FIELDS.find((f) => f.id === field);
  if (!def) throw new Error(`Unknown project sort field: ${field}`);
  return def;
}

export function getProjectSortFieldLabel(field: ProjectSortField): string {
  return getProjectSortFieldDef(field).label;
}
