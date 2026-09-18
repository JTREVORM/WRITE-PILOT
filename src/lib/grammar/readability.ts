import { splitSentences, words } from "../text/segment.ts";

/**
 * Readability measurements.
 *
 * Computed locally, deterministically, and from published formulas — so unlike
 * the suggestions themselves these can be checked, reproduced and tested. They
 * are reported as properties of the text, with the audience described in plain
 * words rather than as a score the writer is meant to chase.
 *
 * Flesch Reading Ease and Flesch-Kincaid Grade Level are both calibrated on
 * English. They are reported as approximate for that reason.
 */

export interface ReadabilitySummary {
  wordCount: number;
  sentenceCount: number;
  syllableCount: number;
  meanSentenceLength: number;
  /** Flesch Reading Ease, 0-100 (clamped). Higher is easier. */
  readingEase: number;
  /** Flesch-Kincaid grade level, in US school years. */
  gradeLevel: number;
  /** Sentences over 30 words — the ones worth breaking up. */
  longSentenceCount: number;
  longSentenceShare: number;
  /** A plain-language reading of the ease score. */
  easeLabel: string;
  easeDescription: string;
}

/**
 * Estimates syllables in an English word.
 *
 * A heuristic, not a dictionary. It counts runs of vowels, then corrects the
 * three cases that would otherwise skew an aggregate: a silent trailing "e",
 * an "-ed" ending that is only its own syllable after t or d ("wanted" but not
 * "walked"), and a consonant + "-le" ending that keeps its syllable ("table").
 *
 * Good enough for a formula averaged over hundreds of words, which is all
 * Flesch needs — and wrong often enough on individual words that the result is
 * always reported as approximate.
 */
export function countSyllables(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!cleaned) return 0;
  if (cleaned.length <= 3) return 1;

  const working = cleaned
    // A leading "y" is a consonant: "yellow" is two syllables, not three.
    .replace(/^y/, "")
    // "-ed" is a syllable of its own only after t or d.
    .replace(/(?<![td])ed$/, "")
    // "-es" is silent except after a sibilant.
    .replace(/(?<![sxzcgh])es$/, "")
    // Silent trailing "e": "make", "time".
    .replace(/e$/, "");

  // Whole vowel runs, so "beautiful" counts "eau" once rather than twice.
  const groups = working.match(/[aeiouy]+/g) ?? [];
  let count = groups.length;

  // "table", "little" — checked against the original, since the step above
  // removed the "e" this rule looks for.
  if (/[^aeiouy]le$/.test(cleaned)) count += 1;

  return Math.max(1, count);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** Plain-language reading of a Flesch Reading Ease score. */
export function describeEase(score: number): {
  label: string;
  description: string;
} {
  if (score >= 70) {
    return {
      label: "Easy to read",
      description: "Most readers will follow this without effort.",
    };
  }
  if (score >= 50) {
    return {
      label: "Fairly readable",
      description:
        "Comfortable for a general audience, and typical of good academic prose.",
    };
  }
  if (score >= 30) {
    return {
      label: "Demanding",
      description:
        "Long sentences and heavier vocabulary. Normal for specialist writing, harder going for everyone else.",
    };
  }
  return {
    label: "Very demanding",
    description:
      "Dense enough that most readers will have to re-read. Shorter sentences would help.",
  };
}

export function analyzeReadability(text: string): ReadabilitySummary {
  const sentences = splitSentences(text);
  const allWords = words(text);

  const syllableCount = allWords.reduce(
    (total, word) => total + countSyllables(word),
    0,
  );

  const sentenceCount = sentences.length;
  const wordCount = allWords.length;

  const meanSentenceLength = sentenceCount > 0 ? wordCount / sentenceCount : 0;
  const syllablesPerWord = wordCount > 0 ? syllableCount / wordCount : 0;

  // Both formulas are undefined without sentences and words to measure.
  const readingEase =
    sentenceCount > 0 && wordCount > 0
      ? clamp(206.835 - 1.015 * meanSentenceLength - 84.6 * syllablesPerWord, 0, 100)
      : 0;

  const gradeLevel =
    sentenceCount > 0 && wordCount > 0
      ? Math.max(0, 0.39 * meanSentenceLength + 11.8 * syllablesPerWord - 15.59)
      : 0;

  const longSentenceCount = sentences.filter(
    (sentence) => words(sentence).length > 30,
  ).length;

  const ease = describeEase(readingEase);

  return {
    wordCount,
    sentenceCount,
    syllableCount,
    meanSentenceLength: round(meanSentenceLength),
    readingEase: round(readingEase),
    gradeLevel: round(gradeLevel),
    longSentenceCount,
    longSentenceShare:
      sentenceCount > 0 ? round(longSentenceCount / sentenceCount, 3) : 0,
    easeLabel: ease.label,
    easeDescription: ease.description,
  };
}
