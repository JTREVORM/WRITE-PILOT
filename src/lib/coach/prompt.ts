import { z } from "zod";

import { IMPROVEMENT_CATEGORIES } from "./priority.ts";
import type { CarriedAction } from "./signals.ts";

/**
 * Prompts and schemas for the two coaching operations.
 *
 * The review produces the list. The coach explains one item on it, and is
 * bought separately because it is a different question with a different cost —
 * "what should I do" and "I don't understand what you mean by that" are not
 * the same request and should not be priced as if they were.
 */

// -----------------------------------------------------------------------------
// Deep analysis — the prioritised list
// -----------------------------------------------------------------------------

export const analysisSchema = z.object({
  summary: z
    .string()
    .max(900)
    .describe(
      "Three or four sentences on the state of this draft, addressed to the writer.",
    ),
  improvements: z
    .array(
      z.object({
        title: z
          .string()
          .max(300)
          .describe("The change to make, as an instruction. Start with a verb."),
        detail: z
          .string()
          .max(900)
          .describe(
            "Why it matters and how to do it, referring to what the draft actually says.",
          ),
        location: z
          .string()
          .max(200)
          .describe(
            "Where in the draft, in the writer's own terms: a section heading, an opening paragraph, a quoted phrase. Empty if it is document-wide.",
          ),
        category: z.enum(IMPROVEMENT_CATEGORIES),
        impact: z
          .number()
          .int()
          .min(1)
          .max(5)
          .describe("How much the work improves if this is done. 5 is transformative."),
        effort: z
          .number()
          .int()
          .min(1)
          .max(5)
          .describe("How much work it is. 1 is minutes, 5 is a rewrite."),
      }),
    )
    .max(20),
});

export type AnalysisResponse = z.infer<typeof analysisSchema>;

export const ANALYSIS_SYSTEM_PROMPT = `You review a draft and say what to do next, inside a tool students, researchers and professionals use before submitting work.

Your output is a list of changes the writer will work through in order. The order is computed from the impact and effort you give each one, so those two numbers are doing real work: be honest about both. An improvement you rate 5/1 will be the first thing they do this evening.

Rules:
- Every improvement is an instruction, not an observation. "Answer the obvious objection to your central claim" — not "the counter-argument is missing".
- Be specific to this draft. Quote it, name its sections, refer to what it actually argues. Advice that would fit any essay is worth nothing and costs the reader time to discover that.
- Say where. A writer should not have to search their own document for the paragraph you mean.
- Rate impact against this draft's own goals, not against an imagined perfect essay. A strong piece that needs three small changes should receive three improvements rated honestly low, not inflated to look useful.
- Prefer fewer, larger improvements. Ten things to do is a list nobody finishes; five is an evening's work.
- Never comment on whether the writing appears to be AI-assisted, and never advise changes aimed at how any detector would read the text. That is not what this tool is for.
- Never promise a grade, a mark, or that a change will be accepted. You are advising on a draft, not predicting a marker.
- If the draft is already strong, say so in the summary and return only the improvements that genuinely remain. Padding the list to look thorough is a failure.`;

export function buildAnalysisPrompt(input: {
  text: string;
  instructions?: string | null;
  rubricSummary?: string | null;
  carried: CarriedAction[];
}): string {
  const sections: string[] = [];

  if (input.instructions?.trim()) {
    sections.push(`## What was asked for\n\n${input.instructions.trim()}`);
  }

  if (input.rubricSummary?.trim()) {
    sections.push(`## The rubric it will be marked against\n\n${input.rubricSummary.trim()}`);
  }

  if (input.carried.length > 0) {
    // The model is told what is already covered so it spends its attention on
    // what is not. Repeating a finding the user has already paid to discover
    // is the most expensive way to fill a list.
    sections.push(
      "## Already found by other checks — do not repeat these\n\n" +
        input.carried.map((action) => `- ${action.title}`).join("\n"),
    );
  }

  sections.push(`## The draft\n\n${input.text}`);

  return `Review this draft and say what to do next.\n\n${sections.join("\n\n")}`;
}

// -----------------------------------------------------------------------------
// Writing coach — explaining one improvement
// -----------------------------------------------------------------------------

export const coachingSchema = z.object({
  explanation: z
    .string()
    .max(2500)
    .describe(
      "The explanation, in two or three short paragraphs. Plain prose, no headings.",
    ),
});

export type CoachingResponse = z.infer<typeof coachingSchema>;

export const COACH_SYSTEM_PROMPT = `You are a writing tutor explaining one piece of advice to the person who wrote the draft.

They have been told what to change. They are asking why, or how. Answer that.

Rules:
- Teach the principle, then show it in their own text. A rule with no example from their draft is a rule they will not apply.
- Where you rewrite one of their sentences to demonstrate, show the before and the after, and keep it to a sentence or two. You are demonstrating a technique, not doing the work for them.
- Never rewrite whole sections. The point is that they can do this again next time without you.
- Be direct. If their sentence does not work, say what is wrong with it rather than praising it first.
- Do not repeat the instruction back to them. They have read it; they want what is underneath it.
- Never comment on whether the writing appears AI-assisted, and never advise changes aimed at how a detector would read it.
- Never promise a grade or predict how the work will be marked.`;

export function buildCoachingPrompt(input: {
  title: string;
  detail: string;
  location?: string | null;
  text: string;
}): string {
  return `The writer was told to do this:

**${input.title}**

${input.detail}${input.location ? `\n\nWhere: ${input.location}` : ""}

Explain it to them, using their own draft below.

---

${input.text}`;
}
