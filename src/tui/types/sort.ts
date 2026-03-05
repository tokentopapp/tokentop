export type SortDirection = "asc" | "desc";

export interface SortFieldDef<F extends string = string> {
  readonly id: F;
  readonly label: string;
  /** Uppercase letter shown in overlay + used as Shift+key shortcut */
  readonly shortcutKey: string;
  /** Default direction when switching to this field */
  readonly defaultDirection: SortDirection;
}

/** Build a lowercase-key → field-id map from any fields array */
export function buildShortcutMap<F extends string>(
  fields: readonly SortFieldDef<F>[],
): ReadonlyMap<string, F> {
  return new Map(fields.map((f) => [f.shortcutKey.toLowerCase(), f.id]));
}

// ---------------------------------------------------------------------------
// Dashboard sort fields
// ---------------------------------------------------------------------------

export type SortField =
  | "cost"
  | "tokens"
  | "time"
  | "requests"
  | "duration"
  | "project"
  | "agent"
  | "model"
  | "name";

export const SORT_FIELDS: readonly SortFieldDef<SortField>[] = [
  { id: "agent", label: "Agent", shortcutKey: "A", defaultDirection: "desc" },
  { id: "model", label: "Model", shortcutKey: "M", defaultDirection: "desc" },
  { id: "requests", label: "Requests", shortcutKey: "E", defaultDirection: "desc" },
  { id: "tokens", label: "Tokens", shortcutKey: "K", defaultDirection: "desc" },
  { id: "cost", label: "Cost", shortcutKey: "C", defaultDirection: "desc" },
  { id: "project", label: "Project", shortcutKey: "O", defaultDirection: "desc" },
  { id: "name", label: "Name", shortcutKey: "N", defaultDirection: "desc" },
  { id: "duration", label: "Duration", shortcutKey: "U", defaultDirection: "desc" },
  { id: "time", label: "Time", shortcutKey: "T", defaultDirection: "desc" },
] as const;

/** Map from lowercase shortcut key → SortField (dashboard) */
export const SHORTCUT_TO_FIELD: ReadonlyMap<string, SortField> = buildShortcutMap(SORT_FIELDS);

export function getSortFieldDef(field: SortField): SortFieldDef<SortField> {
  const def = SORT_FIELDS.find((f) => f.id === field);
  if (!def) throw new Error(`Unknown sort field: ${field}`);
  return def;
}

export function getSortFieldLabel(field: SortField): string {
  return getSortFieldDef(field).label;
}

export function getSortDirectionIndicator(dir: SortDirection): string {
  return dir === "desc" ? "▼" : "▲";
}
