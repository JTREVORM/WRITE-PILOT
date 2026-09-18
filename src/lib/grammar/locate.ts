import { splitSentenceSpans, type Span } from "../text/segment.ts";

/**
 * Turning a model's suggestion into an exact range in the user's text.
 *
 * The model is given numbered sentences and asked to quote the fragment it
 * wants changed. It is never asked for character positions — it cannot count
 * them reliably, and a wrong offset here would splice a correction into the
 * middle of an unrelated word.
 *
 * So the fragment is located *inside the sentence it was reported against*.
 * Anything that cannot be found verbatim there is dropped. Failing closed costs
 * a suggestion; guessing corrupts a document.
 */

export interface RawSuggestion {
  sentence_index: number;
  original_fragment: string;
  suggested_fragment: string;
  category: string;
  severity: string;
  explanation: string;
}

export interface LocatedSuggestion {
  position: number;
  startOffset: number;
  endOffset: number;
  originalText: string;
  suggestedText: string;
  category: string;
  severity: string;
  explanation: string;
}

export interface LocateResult {
  located: LocatedSuggestion[];
  /** Why suggestions were dropped, for logging rather than for the user. */
  dropped: Array<{ reason: string; fragment: string }>;
}

const CATEGORIES = new Set([
  "grammar",
  "spelling",
  "punctuation",
  "structure",
  "tense",
  "word_choice",
  "clarity",
  "repetition",
  "wordiness",
]);

const SEVERITIES = new Set(["correction", "improvement", "consideration"]);

/** True when two half-open ranges share any character. */
export function overlaps(
  a: { startOffset: number; endOffset: number },
  b: { startOffset: number; endOffset: number },
): boolean {
  return a.startOffset < b.endOffset && b.startOffset < a.endOffset;
}

export function locateSuggestions(
  text: string,
  raw: RawSuggestion[],
  sentenceSpans: Span[] = splitSentenceSpans(text),
): LocateResult {
  const located: LocatedSuggestion[] = [];
  const dropped: LocateResult["dropped"] = [];

  for (const item of raw) {
    const fragment = item.original_fragment;

    if (typeof fragment !== "string" || fragment.length === 0) {
      dropped.push({ reason: "empty_fragment", fragment: String(fragment) });
      continue;
    }

    if (!Number.isInteger(item.sentence_index)) {
      dropped.push({ reason: "invalid_index", fragment });
      continue;
    }

    const span = sentenceSpans[item.sentence_index];
    if (!span) {
      dropped.push({ reason: "index_out_of_range", fragment });
      continue;
    }

    // Scoped to the sentence: searching the whole document would attach a
    // correction to the first coincidental match of a common word.
    const withinSentence = span.text.indexOf(fragment);
    if (withinSentence === -1) {
      dropped.push({ reason: "fragment_not_found", fragment });
      continue;
    }

    // A fragment appearing twice in one sentence is genuinely ambiguous —
    // "the the" is exactly the case, and correcting the wrong occurrence looks
    // like a bug to the user.
    if (span.text.indexOf(fragment, withinSentence + 1) !== -1) {
      dropped.push({ reason: "ambiguous_fragment", fragment });
      continue;
    }

    const startOffset = span.start + withinSentence;
    const endOffset = startOffset + fragment.length;

    // The offsets must slice back to the fragment, or something has drifted.
    if (text.slice(startOffset, endOffset) !== fragment) {
      dropped.push({ reason: "offset_mismatch", fragment });
      continue;
    }

    if (!CATEGORIES.has(item.category)) {
      dropped.push({ reason: "unknown_category", fragment });
      continue;
    }

    // A suggestion that changes nothing is noise in the list.
    if (item.suggested_fragment === fragment) {
      dropped.push({ reason: "no_change", fragment });
      continue;
    }

    const candidate: LocatedSuggestion = {
      position: 0,
      startOffset,
      endOffset,
      originalText: fragment,
      suggestedText:
        typeof item.suggested_fragment === "string" ? item.suggested_fragment : "",
      category: item.category,
      severity: SEVERITIES.has(item.severity) ? item.severity : "improvement",
      explanation: (item.explanation ?? "").slice(0, 400),
    };

    // Overlapping edits cannot both be applied — the second would splice into
    // text the first already replaced. First one wins.
    if (located.some((existing) => overlaps(existing, candidate))) {
      dropped.push({ reason: "overlapping", fragment });
      continue;
    }

    located.push(candidate);
  }

  // Ordered by position in the document, which is the order the user reads
  // them in, then numbered so the database has a stable key.
  located.sort((a, b) => a.startOffset - b.startOffset);
  located.forEach((suggestion, index) => {
    suggestion.position = index;
  });

  return { located, dropped };
}
