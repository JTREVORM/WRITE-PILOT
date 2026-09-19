import type { CitationSeverity } from "@/types/database";

/**
 * How findings are labelled and coloured.
 *
 * Kept out of the components so the severity vocabulary is defined once. Every
 * tone pairs with a written label wherever it is used — the severity of a
 * finding must never be carried by colour alone.
 */

export const SEVERITY_LABELS: Record<CitationSeverity, string> = {
  error: "Breaks the style",
  warning: "Check this",
  info: "Worth knowing",
};

export const SEVERITY_STYLES: Record<CitationSeverity, string> = {
  error: "text-danger-700 dark:text-danger-500 bg-danger-50 dark:bg-danger-700/20",
  warning:
    "text-warning-700 dark:text-warning-500 bg-warning-50 dark:bg-warning-700/20",
  info: "text-foreground-muted bg-surface-muted",
};

export const SEVERITY_ORDER: CitationSeverity[] = ["error", "warning", "info"];

/**
 * What each locally-computed finding is called on screen.
 *
 * The model's findings all arrive as "format", because what it found is in its
 * message; these are the ones the server counted, and each has a fixed name.
 */
export const KIND_LABELS: Record<string, string> = {
  orphan_citation: "Not in the reference list",
  uncited_reference: "Never cited",
  year_mismatch: "Years disagree",
  duplicate_reference: "Listed twice",
  missing_list: "No reference list",
  numeric_style: "Different citation system",
  no_citations: "No citations found",
  format: "Formatting",
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? "Formatting";
}

/**
 * The two halves of a check, as the user is told about them.
 *
 * "Checked" means the server compared the text against the reference list and
 * counted. "Assessed" means a model read the entry against the style's rules.
 * Nothing in the interface is allowed to present the second as the first.
 */
export const ORIGIN_LABELS = {
  local: "Checked",
  model: "Assessed",
} as const;

export const ORIGIN_DESCRIPTIONS = {
  local:
    "Found by comparing your citations against your reference list, character by character.",
  model:
    "A model's reading of your entries against the style's rules. Treat it as a second opinion, not a verdict.",
} as const;
