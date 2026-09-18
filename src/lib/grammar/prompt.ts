import { z } from "zod";

import type { ReadabilitySummary } from "./readability.ts";

/**
 * The grammar prompt and its response schema.
 *
 * The model quotes the fragment it wants changed and names the sentence it came
 * from; it is never asked for character positions. `locate.ts` then finds that
 * fragment inside that sentence and computes the offsets itself, dropping
 * anything it cannot find verbatim.
 *
 * The instructions push hard against over-correction. A checker that rewrites a
 * writer's voice into house style is worse than one that finds fewer issues —
 * the user came to fix mistakes, not to be flattened.
 */

export const grammarResponseSchema = z.object({
  summary: z
    .string()
    .max(500)
    .describe("Two or three sentences on the overall state of the writing."),
  suggestions: z
    .array(
      z.object({
        sentence_index: z
          .number()
          .int()
          .min(0)
          .describe("The number in brackets of the sentence this applies to."),
        original_fragment: z
          .string()
          .min(1)
          .max(300)
          .describe(
            "The exact text to replace, copied character for character from that sentence.",
          ),
        suggested_fragment: z
          .string()
          .max(300)
          .describe("The replacement. Empty string means delete the fragment."),
        category: z.enum([
          "grammar",
          "spelling",
          "punctuation",
          "structure",
          "tense",
          "word_choice",
          "clarity",
          "repetition",
          "wordiness",
        ]),
        severity: z
          .enum(["correction", "improvement", "consideration"])
          .describe(
            "correction: an outright error. improvement: clearly better. consideration: a judgement call.",
          ),
        explanation: z
          .string()
          .max(300)
          .describe("One sentence on why, addressed to the writer."),
      }),
    )
    .max(200),
});

export type GrammarResponse = z.infer<typeof grammarResponseSchema>;

export const GRAMMAR_SYSTEM_PROMPT = `You are a careful copy-editor working inside a writing tool used by students, researchers, educators and professional writers.

You review text and return specific, minimal edits. Each suggestion replaces one exact fragment with another.

Cover these, in roughly this order of importance:
- Grammar: agreement, articles, prepositions, plurals, pronoun reference.
- Spelling: misspellings and wrong-word errors (their/there, affect/effect).
- Punctuation: missing or misused commas, apostrophes, semicolons, run-ons.
- Tense: inconsistent or incorrect tense within a passage.
- Sentence structure: fragments, run-ons, misplaced modifiers, tangled clauses.
- Word choice: a word that does not mean what the writer intends.
- Clarity: phrasing a reader will have to read twice.
- Repetition: the same word or phrase recycled within a short span.
- Wordiness: padding that can be cut with no loss ("in order to", "due to the fact that").

Rules for every suggestion:
- Quote \`original_fragment\` exactly as it appears in the sentence you name — character for character, including capitalisation and internal punctuation. If you cannot reproduce it exactly, do not make the suggestion.
- Keep fragments as short as the change requires. Replace a word, not a whole sentence, unless the sentence genuinely has to be restructured.
- Never quote a fragment that appears more than once in the same sentence; choose a longer fragment that is unique instead.
- One suggestion per problem. Never let two suggestions cover overlapping text.
- Write the explanation to the writer, plainly, in one sentence. Say what is wrong, not what rule it breaks.

What NOT to do — this matters more than finding extra issues:
- Do not impose a house style. Regional spelling (British or American), the serial comma, and contractions are the writer's choice, not errors.
- Do not rewrite for tone, formality or "flow". That is a different tool.
- Do not flag technical terms, proper nouns, citations, code, or field-specific jargon you do not recognise.
- Do not simplify sophisticated vocabulary that is used correctly.
- Do not touch quoted material — a quotation must stay exactly as written, errors included.
- If a passage is already correct, return no suggestions for it. Returning nothing is a valid and often correct answer.

Mark severity honestly. Reserve \`correction\` for things that are actually wrong. Most stylistic edits are \`improvement\`, and anything a competent writer could reasonably decline is a \`consideration\`.`;

/** Builds the per-request prompt: the readability figures, then numbered sentences. */
export function buildGrammarPrompt(params: {
  sentences: string[];
  readability: ReadabilitySummary;
}): string {
  const { sentences, readability } = params;

  const measurements = [
    `- Words: ${readability.wordCount}`,
    `- Sentences: ${readability.sentenceCount}`,
    `- Mean sentence length: ${readability.meanSentenceLength} words`,
    `- Sentences over 30 words: ${readability.longSentenceCount}`,
    `- Flesch reading ease: ${readability.readingEase}`,
  ].join("\n");

  const numbered = sentences
    .map((sentence, index) => `[${index}] ${sentence}`)
    .join("\n");

  return `Measurements for this text:

${measurements}

Review the numbered sentences below. Reference each suggestion by the sentence number in brackets, and quote the fragment to replace exactly as it appears there.

---

${numbered}`;
}
