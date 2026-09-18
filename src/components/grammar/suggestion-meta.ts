import type {
  SuggestionCategory,
  SuggestionSeverity,
} from "@/types/database";

/**
 * Display metadata for suggestion categories and severities.
 *
 * Kept in one place so the label a user sees in the filter row, the card and
 * the inline mark can never disagree.
 */

export const CATEGORY_LABELS: Record<SuggestionCategory, string> = {
  grammar: "Grammar",
  spelling: "Spelling",
  punctuation: "Punctuation",
  structure: "Sentence structure",
  tense: "Tense",
  word_choice: "Word choice",
  clarity: "Clarity",
  repetition: "Repetition",
  wordiness: "Wordiness",
};

export const SEVERITY_LABELS: Record<SuggestionSeverity, string> = {
  correction: "Correction",
  improvement: "Improvement",
  consideration: "Consideration",
};

/**
 * Severity carries the visual weight, not category: a user triaging a long list
 * wants to know what is actually wrong before what merely reads better.
 *
 * Colour is never the only cue — every mark and card also carries the severity
 * word, because an underline colour alone is meaningless to a reader who cannot
 * distinguish it.
 */
export const SEVERITY_STYLES: Record<
  SuggestionSeverity,
  { mark: string; dot: string; text: string }
> = {
  correction: {
    mark: "decoration-danger-500 bg-danger-50/70 dark:bg-danger-700/20",
    dot: "bg-danger-500",
    text: "text-danger-700 dark:text-danger-500",
  },
  improvement: {
    mark: "decoration-warning-500 bg-warning-50/70 dark:bg-warning-700/20",
    dot: "bg-warning-500",
    text: "text-warning-700 dark:text-warning-500",
  },
  consideration: {
    mark: "decoration-brand-400 bg-brand-50/70 dark:bg-brand-950/60",
    dot: "bg-brand-400",
    text: "text-brand-700 dark:text-brand-300",
  },
};

export const SEVERITY_ORDER: SuggestionSeverity[] = [
  "correction",
  "improvement",
  "consideration",
];
