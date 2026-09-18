/**
 * Producing the corrected text.
 *
 * The stored original is never rewritten. The corrected version is derived by
 * applying whichever suggestions the user has accepted, which is what makes
 * "undo" free: rejecting a suggestion and re-deriving gives back exactly the
 * original characters.
 */

export interface ApplicableSuggestion {
  startOffset: number;
  endOffset: number;
  suggestedText: string;
  status: "pending" | "accepted" | "rejected";
}

/**
 * Applies accepted suggestions to the original text.
 *
 * Splices from the end backwards so each replacement leaves the offsets of the
 * ones before it untouched — patching forwards would shift every subsequent
 * range by the length difference of the edit just made.
 *
 * Overlapping ranges are excluded when suggestions are first located, so this
 * function can assume they are disjoint; it still skips any that would splice
 * outside the text rather than trusting that.
 */
export function applySuggestions(
  original: string,
  suggestions: ApplicableSuggestion[],
): string {
  const accepted = suggestions
    .filter((suggestion) => suggestion.status === "accepted")
    .filter(
      (suggestion) =>
        suggestion.startOffset >= 0 &&
        suggestion.endOffset <= original.length &&
        suggestion.endOffset > suggestion.startOffset,
    )
    .sort((a, b) => b.startOffset - a.startOffset);

  let result = original;
  let previousStart = Number.POSITIVE_INFINITY;

  for (const suggestion of accepted) {
    // Defensive: a range overlapping the one just applied would corrupt the
    // text. Locating already excludes these, so this should never fire.
    if (suggestion.endOffset > previousStart) continue;

    result =
      result.slice(0, suggestion.startOffset) +
      suggestion.suggestedText +
      result.slice(suggestion.endOffset);

    previousStart = suggestion.startOffset;
  }

  return result;
}

export interface SuggestionCounts {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
}

export function countByStatus(
  suggestions: Array<{ status: ApplicableSuggestion["status"] }>,
): SuggestionCounts {
  return {
    total: suggestions.length,
    pending: suggestions.filter((s) => s.status === "pending").length,
    accepted: suggestions.filter((s) => s.status === "accepted").length,
    rejected: suggestions.filter((s) => s.status === "rejected").length,
  };
}

/**
 * Splits the original into the runs a reader sees: untouched text, and the
 * spans a suggestion applies to. Used to render the document with its
 * suggestions marked inline.
 */
export interface TextRun<T> {
  text: string;
  suggestion: T | null;
}

export function buildRuns<
  T extends { startOffset: number; endOffset: number },
>(original: string, suggestions: T[]): Array<TextRun<T>> {
  const ordered = [...suggestions]
    .filter(
      (s) =>
        s.startOffset >= 0 &&
        s.endOffset <= original.length &&
        s.endOffset > s.startOffset,
    )
    .sort((a, b) => a.startOffset - b.startOffset);

  const runs: Array<TextRun<T>> = [];
  let cursor = 0;

  for (const suggestion of ordered) {
    // Skip anything overlapping what has already been emitted.
    if (suggestion.startOffset < cursor) continue;

    if (suggestion.startOffset > cursor) {
      runs.push({
        text: original.slice(cursor, suggestion.startOffset),
        suggestion: null,
      });
    }

    runs.push({
      text: original.slice(suggestion.startOffset, suggestion.endOffset),
      suggestion,
    });

    cursor = suggestion.endOffset;
  }

  if (cursor < original.length) {
    runs.push({ text: original.slice(cursor), suggestion: null });
  }

  return runs;
}
