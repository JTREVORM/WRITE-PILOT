import type {
  ImprovementCategoryValue,
  ImprovementOrigin,
} from "@/types/database";

/**
 * How improvements are labelled.
 *
 * The origin vocabulary matters most: "Measured" means the server counted it
 * from a check the user already ran, "Advised" means a model judged it from the
 * text. Nothing in the interface presents the second as the first.
 */

export const CATEGORY_LABELS: Record<ImprovementCategoryValue, string> = {
  structure: "Structure",
  argument: "Argument",
  evidence: "Evidence",
  clarity: "Clarity",
  mechanics: "Mechanics",
  citations: "Citations",
  formatting: "Formatting",
};

export const ORIGIN_LABELS: Record<ImprovementOrigin, string> = {
  measured: "Measured",
  advised: "Advised",
};

export const ORIGIN_DESCRIPTIONS: Record<ImprovementOrigin, string> = {
  measured:
    "Carried forward from a check you already ran on this document, and counted rather than judged.",
  advised:
    "A model's reading of your draft. Useful, and not the same kind of thing as a count.",
};

export const BAND_STYLES = {
  first: "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200",
  worthwhile: "bg-surface-muted text-foreground-muted",
  optional: "bg-surface-muted text-foreground-subtle",
} as const;
