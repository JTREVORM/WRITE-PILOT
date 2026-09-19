import { z } from "zod";

import type { CitationStyle } from "./styles.ts";

/**
 * The formatting half of the check.
 *
 * Whether a source is cited and listed is arithmetic, and `match.ts` does it
 * locally. What is left is genuinely a judgement — does this entry follow APA 7
 * — and that is what the model is asked, for the reference entries and the
 * in-text citations only. It never sees a question it could answer by guessing
 * about the world: it is not asked whether a source exists, whether a DOI
 * resolves, or whether the work says what the writer claims.
 */

export const citationReviewSchema = z.object({
  detected_style: z
    .string()
    .max(60)
    .describe(
      "The style the document actually appears to follow, or 'mixed' or 'unclear'.",
    ),
  summary: z
    .string()
    .max(700)
    .describe(
      "Two or three sentences on the state of the citations overall, addressed to the writer.",
    ),
  findings: z
    .array(
      z.object({
        entry_index: z
          .number()
          .int()
          .describe(
            "The numbered reference entry this is about, or -1 for an in-text citation or a whole-document observation.",
          ),
        target: z
          .string()
          .max(400)
          .describe("The exact text this is about, copied from the document."),
        severity: z
          .enum(["error", "warning", "info"])
          .describe(
            "error: breaks the style's rules. warning: probably wrong, or incomplete. info: worth knowing.",
          ),
        message: z.string().max(400).describe("What is wrong, in one sentence."),
        suggestion: z
          .string()
          .max(500)
          .describe(
            "The corrected text where you can give it, otherwise what to change. Empty if there is nothing to fix.",
          ),
      }),
    )
    .max(80),
});

export type CitationReview = z.infer<typeof citationReviewSchema>;

export function buildCitationSystemPrompt(style: CitationStyle): string {
  return `You check how citations and references are written, against ${style.label}, inside a tool students and researchers use before submitting work.

What you are checking:
- Each numbered reference entry, against the rules below.
- The in-text citations, for the form ${style.label} requires.

${style.label} rules that apply here:
${style.rules.map((rule) => `- ${rule}`).join("\n")}

A correctly formatted journal article in this style reads:
${style.referenceExample}

An in-text citation reads: ${style.inTextExample}

Hard limits on what you may say:
- You are working from extracted plain text. Italics, underlining, indentation and small caps do not survive extraction. Never report anything as missing or wrong on those grounds, and never tell the writer to italicise something — you cannot see whether they already have.
- You cannot verify that a source exists, that a DOI resolves, that an author wrote what is attributed to them, or that the work supports the claim it is cited for. Never imply that you have checked any of these. If an entry looks implausible, say only that the writer should check it against the source.
- Whether each cited work appears in the reference list has already been checked by exact comparison, and those findings are shown to the user separately. Do not repeat them.
- Never comment on the quality, originality or authorship of the writing. That is not this tool.

How to report:
- One finding per problem. Do not report the same problem on twenty entries individually if it is one habit — report it once, on the first entry, and say it applies throughout.
- Give the corrected entry in suggestion whenever you can reconstruct it from what is there. Where information is genuinely absent (no page range, no publisher), say what is missing instead of inventing it. Never fabricate a DOI, a publisher, a page range or a year.
- If an entry is already correct, say nothing about it. A clean entry needs no finding.
- Where ${style.label} genuinely permits more than one form, do not flag either.
- If the document follows a different style consistently, set detected_style to that style and report it once as an info finding rather than rewriting every entry.`;
}

export function buildCitationPrompt(input: {
  style: CitationStyle;
  entries: string[];
  inTextSamples: string[];
}): string {
  const entries = input.entries.length
    ? input.entries.map((entry, index) => `[${index}] ${entry}`).join("\n\n")
    : "(no reference list was found in this document)";

  const citations = input.inTextSamples.length
    ? input.inTextSamples.map((citation) => `- ${citation}`).join("\n")
    : "(no in-text citations were found)";

  return `Check these citations against ${input.style.label}.

## Reference entries

${entries}

## In-text citations, as they appear in the text

${citations}`;
}
