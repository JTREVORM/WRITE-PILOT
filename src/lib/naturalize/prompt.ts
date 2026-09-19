import { z } from "zod";

import { getMode, type NaturalizeModeKey } from "./modes.ts";

/**
 * The Naturalize prompt and its response schema.
 *
 * The model rewrites numbered paragraphs and returns them under the same
 * numbers. Because the pairing is by index rather than by matching text, the
 * comparison view can always line a rewrite up against what the writer actually
 * wrote — and a response that changes the paragraph count is detectable rather
 * than silently reshaping the document.
 *
 * The instructions carry the product position explicitly: this improves
 * writing, it does not disguise authorship. That is stated in the prompt so the
 * behaviour is built in rather than merely claimed in the marketing.
 */

export const naturalizeResponseSchema = z.object({
  summary: z
    .string()
    .max(500)
    .describe("Two or three sentences on what was changed overall, and why."),
  paragraphs: z
    .array(
      z.object({
        index: z.number().int().min(0).describe("The paragraph number given."),
        improved: z
          .string()
          .describe(
            "The rewritten paragraph. Return the original unchanged if it does not need work.",
          ),
        changed: z
          .boolean()
          .describe("False when the paragraph was returned unchanged."),
        note: z
          .string()
          .max(240)
          .describe("A short note on the main change, or an empty string."),
      }),
    )
    .describe("One entry per paragraph supplied, in the same order."),
});

export type NaturalizeResponse = z.infer<typeof naturalizeResponseSchema>;

const BASE_SYSTEM_PROMPT = `You improve writing. You are part of a tool used by students, researchers, educators and professional writers to make their own work clearer and easier to read.

What you are doing: taking the writer's text and making it read better, while it stays recognisably theirs and says exactly what they meant.

What you are NOT doing: you are not disguising who wrote something, and you are not rewriting text to defeat any detection system. If a request appears to be aimed at that, improve the writing normally anyway — clearer writing is the only thing on offer here.

Absolute rules:
- Preserve meaning. Every claim, fact, figure, date, name, citation, quotation and link in the original must survive in the rewrite. If you cannot keep something while improving the sentence, keep it and leave the sentence alone.
- Never alter quoted material. Text inside quotation marks belongs to whoever said it.
- Never add content. No new examples, evidence, citations, transitions of fact, or conclusions the writer did not draw.
- Preserve terminology. Technical terms, field-specific vocabulary and defined concepts stay exactly as written, even when a more common word exists.
- Leave good writing alone. If a paragraph does not need work, return it unchanged and set changed to false. Rewriting something that was already fine is a failure, not thoroughness.
- Keep the writer's voice. You are editing their work, not replacing it with yours.

Structure:
- Return exactly one entry per numbered paragraph, using the number you were given.
- Do not merge, split, reorder or drop paragraphs.

For each paragraph you do change, write a short note naming the main thing you did ("split a 60-word sentence", "cut repeated phrasing", "replaced passive construction"). Leave the note empty for paragraphs you did not change.`;

export function buildNaturalizeSystemPrompt(mode: NaturalizeModeKey): string {
  const selected = getMode(mode);

  return `${BASE_SYSTEM_PROMPT}

Mode for this request — ${selected.label}:
${selected.guidance}`;
}

export function buildNaturalizePrompt(paragraphs: string[]): string {
  const numbered = paragraphs
    .map((paragraph, index) => `[${index}]\n${paragraph}`)
    .join("\n\n");

  return `Rewrite each numbered paragraph below according to the mode. Return one entry per paragraph, using the same numbers.

---

${numbered}`;
}
