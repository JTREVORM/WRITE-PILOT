// Relative, with an explicit extension: this module is reachable from the unit
// tests, which run under Node's type-stripping. Node resolves neither the "@/"
// path alias nor an extensionless specifier at runtime. Type-only imports are
// erased before Node sees them, so those may stay aliased.
import { splitParagraphs, splitSentences, words } from "../text/segment.ts";

/**
 * Deterministic writing-pattern measurements.
 *
 * These are computed locally from the text — no model involved — and are the
 * part of a detection result that can actually be explained and reproduced.
 * They are presented to the user as *observations about the writing*, never as
 * proof of anything, and they are passed to the model as evidence so its
 * estimate is informed by the same numbers the user can see.
 *
 * Every measure here is a documented property of the text. None of them
 * identifies an author, and a human writer can score "AI-like" on all of them —
 * which is exactly why the interface reports them descriptively.
 */

export { splitParagraphs, splitSentences, words } from "../text/segment.ts";

export interface WritingSignal {
  key: string;
  label: string;
  /** The measured figure, formatted for display. */
  value: string;
  /** What the measurement is, in plain language. */
  description: string;
  /**
   * Which way this reading leans. "uniform" and "repetitive" are commonly
   * observed in generated text; they are not evidence on their own.
   */
  lean: "varied" | "neutral" | "uniform";
}

export interface SignalSummary {
  sentenceCount: number;
  wordCount: number;
  characterCount: number;
  paragraphCount: number;
  meanSentenceLength: number;
  /** Standard deviation of sentence length — "burstiness". */
  sentenceLengthVariation: number;
  /** Unique words as a share of total words. */
  lexicalDiversity: number;
  /** Share of 4-word sequences that appear more than once. */
  repeatedPhraseRate: number;
  /** Punctuation marks beyond full stops and commas, per 100 words. */
  punctuationVariety: number;
  /** Frequency of formal connectives, per 1000 words. */
  connectiveDensity: number;
  signals: WritingSignal[];
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Formal connectives. Over-representation of these is one of the more commonly
 * remarked-on habits of generated prose — and also of perfectly good academic
 * writing, which is why this is reported as an observation.
 */
const CONNECTIVES = new Set([
  "moreover", "furthermore", "additionally", "consequently", "therefore",
  "however", "nevertheless", "nonetheless", "thus", "hence", "accordingly",
  "subsequently", "notably", "importantly", "overall", "delve", "intricate",
  "pivotal", "crucial", "realm", "underscore", "underscores", "leverage",
  "robust", "comprehensive", "multifaceted", "nuanced", "landscape",
]);

function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function analyzeSignals(text: string): SignalSummary {
  const paragraphs = splitParagraphs(text);
  const sentences = splitSentences(text);
  const allWords = words(text);

  const sentenceLengths = sentences.map((sentence) => words(sentence).length);
  const meanSentenceLength =
    sentenceLengths.length > 0
      ? sentenceLengths.reduce((sum, value) => sum + value, 0) /
        sentenceLengths.length
      : 0;
  const sentenceLengthVariation = standardDeviation(sentenceLengths);

  const uniqueWords = new Set(allWords);
  const lexicalDiversity =
    allWords.length > 0 ? uniqueWords.size / allWords.length : 0;

  // Repeated 4-grams: a direct measure of phrase-level recycling.
  const grams = new Map<string, number>();
  for (let i = 0; i + 4 <= allWords.length; i += 1) {
    const gram = allWords.slice(i, i + 4).join(" ");
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  const totalGrams = Math.max(1, grams.size);
  const repeatedGrams = [...grams.values()].filter((count) => count > 1).length;
  const repeatedPhraseRate = repeatedGrams / totalGrams;

  const richPunctuation = (text.match(/[;:—–()"'?!]/g) ?? []).length;
  const punctuationVariety =
    allWords.length > 0 ? (richPunctuation / allWords.length) * 100 : 0;

  const connectiveCount = allWords.filter((word) =>
    CONNECTIVES.has(word),
  ).length;
  const connectiveDensity =
    allWords.length > 0 ? (connectiveCount / allWords.length) * 1000 : 0;

  const signals: WritingSignal[] = [
    {
      key: "sentence_variation",
      label: "Sentence length variation",
      value: `±${round(sentenceLengthVariation)} words`,
      description:
        "How much sentence length changes across the text. Human drafts usually vary more.",
      lean:
        sentenceLengthVariation >= 7
          ? "varied"
          : sentenceLengthVariation >= 4
            ? "neutral"
            : "uniform",
    },
    {
      key: "mean_sentence_length",
      label: "Average sentence length",
      value: `${round(meanSentenceLength)} words`,
      description: "Longer, even sentences are common in generated prose.",
      lean: "neutral",
    },
    {
      key: "lexical_diversity",
      label: "Vocabulary range",
      value: `${round(lexicalDiversity * 100)}%`,
      description: "Share of the text made up of distinct words.",
      lean:
        lexicalDiversity >= 0.55
          ? "varied"
          : lexicalDiversity >= 0.4
            ? "neutral"
            : "uniform",
    },
    {
      key: "repeated_phrases",
      label: "Repeated phrasing",
      value: `${round(repeatedPhraseRate * 100)}%`,
      description: "Four-word sequences that appear more than once.",
      lean:
        repeatedPhraseRate >= 0.06
          ? "uniform"
          : repeatedPhraseRate >= 0.02
            ? "neutral"
            : "varied",
    },
    {
      key: "punctuation_variety",
      label: "Punctuation range",
      value: `${round(punctuationVariety)} per 100 words`,
      description:
        "Use of semicolons, dashes, colons, questions and quotation marks.",
      lean:
        punctuationVariety >= 4
          ? "varied"
          : punctuationVariety >= 1.5
            ? "neutral"
            : "uniform",
    },
    {
      key: "connective_density",
      label: "Formal connectives",
      value: `${round(connectiveDensity)} per 1,000 words`,
      description:
        "Words such as “moreover” and “furthermore”. Common in both academic and generated writing.",
      lean:
        connectiveDensity >= 12
          ? "uniform"
          : connectiveDensity >= 5
            ? "neutral"
            : "varied",
    },
  ];

  return {
    sentenceCount: sentences.length,
    wordCount: allWords.length,
    characterCount: text.length,
    paragraphCount: paragraphs.length,
    meanSentenceLength: round(meanSentenceLength, 2),
    sentenceLengthVariation: round(sentenceLengthVariation, 2),
    lexicalDiversity: round(lexicalDiversity, 4),
    repeatedPhraseRate: round(repeatedPhraseRate, 4),
    punctuationVariety: round(punctuationVariety, 2),
    connectiveDensity: round(connectiveDensity, 2),
    signals,
  };
}
