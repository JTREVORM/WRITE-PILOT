/**
 * Text segmentation primitives.
 *
 * Shared by every feature that has to reason about where a sentence or a
 * paragraph begins and ends — detection builds its offsets from these, and the
 * grammar checker locates suggestions inside them. Getting a boundary wrong
 * here shows up as a highlight on the wrong words, so this is deliberately one
 * implementation rather than one per feature.
 */

/** Splits on blank lines. Paragraph boundaries drive the segment view. */
export function splitParagraphs(text: string): Array<{
  text: string;
  start: number;
  end: number;
}> {
  const paragraphs: Array<{ text: string; start: number; end: number }> = [];
  const pattern = /[^\n]+(?:\n(?!\s*\n)[^\n]+)*/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[0];
    const leading = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (!trimmed) continue;

    paragraphs.push({
      text: trimmed,
      start: match.index + leading,
      end: match.index + leading + trimmed.length,
    });
  }

  return paragraphs;
}

/**
 * Sentence splitter.
 *
 * Handles the abbreviations that would otherwise inflate the sentence count and
 * wreck the length statistics — "Dr.", "e.g.", "et al." and initials.
 */
const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "st", "jr", "sr",
  "eg", "ie", "etc", "al", "vs", "fig", "no", "vol", "pp", "ed", "cf",
]);

export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let current = "";

  const tokens = text.match(/[^.!?]+[.!?]*|\s+/g) ?? [];

  for (const token of tokens) {
    current += token;

    const trimmed = current.trimEnd();
    if (!/[.!?]$/.test(trimmed)) continue;

    const lastWord = trimmed
      .slice(0, -1)
      .split(/\s+/)
      .pop()
      ?.replace(/[^a-zA-Z]/g, "")
      .toLowerCase();

    // "Dr." or a single initial ("J.") does not end a sentence.
    if (lastWord && (ABBREVIATIONS.has(lastWord) || lastWord.length === 1)) {
      continue;
    }

    sentences.push(trimmed);
    current = "";
  }

  const remainder = current.trim();
  if (remainder) sentences.push(remainder);

  return sentences.filter((sentence) => /\w/.test(sentence));
}

export interface Span {
  text: string;
  start: number;
  end: number;
}

/**
 * Sentences with their exact positions in the source text.
 *
 * The grammar checker needs these: the model reports a suggestion against a
 * numbered sentence, and the fragment it quotes is then located *inside that
 * sentence's span* rather than anywhere in the document. Searching the whole
 * text would attach a correction to the first coincidental match of a common
 * word.
 */
export function splitSentenceSpans(text: string): Span[] {
  const spans: Span[] = [];
  let cursor = 0;

  for (const sentence of splitSentences(text)) {
    const index = text.indexOf(sentence, cursor);
    if (index === -1) continue;

    spans.push({ text: sentence, start: index, end: index + sentence.length });
    cursor = index + sentence.length;
  }

  return spans;
}

export function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
}
