import { z } from "zod";

/**
 * Prompts and schemas for the two grading operations.
 *
 * They are separate calls because they are separate jobs with separate prices:
 * a rubric is extracted once and graded against many times. Keeping them apart
 * also means a bad extraction can be corrected by the user before any
 * submission is judged against it.
 */

// -----------------------------------------------------------------------------
// Stage 1 — extracting a rubric
// -----------------------------------------------------------------------------

export const rubricExtractionSchema = z.object({
  title: z
    .string()
    .max(200)
    .describe("A short name for this rubric, from the document if it has one."),
  notes: z
    .string()
    .max(600)
    .describe(
      "Anything about the rubric a marker should know that is not a criterion — total marks, weighting rules, penalties.",
    ),
  criteria: z
    .array(
      z.object({
        name: z.string().min(1).max(200).describe("The criterion's name."),
        description: z
          .string()
          .max(1000)
          .describe("What the rubric says this criterion requires."),
        max_points: z
          .number()
          .min(0)
          .describe("Points available. Use 0 if the criterion is unpointed."),
      }),
    )
    .max(60),
});

export type RubricExtraction = z.infer<typeof rubricExtractionSchema>;

export const RUBRIC_SYSTEM_PROMPT = `You read marking rubrics and turn them into structured criteria.

Rubrics arrive in every shape: tables, bullet lists, prose paragraphs, marking schemes copied out of a handbook, sometimes a scanned handout run through text extraction. Your job is to find the criteria and what each is worth.

Rules:
- Extract only what is in the document. Never invent a criterion, and never invent a point value. If a criterion carries no marks, set max_points to 0 rather than guessing a number.
- Use the rubric's own wording for each criterion name. Do not rename "Use of sources" to "References" because that is the more common term.
- Put the points in max_points, not in the name.
- Where the rubric describes what earns marks under a criterion, put that in description. If it says nothing, leave description empty rather than writing your own.
- Keep the rubric's order.
- If the document contains weighting rules, mark penalties, word-count penalties or a stated total, put those in notes.
- If the document is not a rubric at all, return no criteria and say so in notes.`;

export function buildRubricPrompt(rawText: string): string {
  return `Extract the marking criteria from this rubric.

---

${rawText}`;
}

// -----------------------------------------------------------------------------
// Stage 2 — grading against the rubric
// -----------------------------------------------------------------------------

export const gradingSchema = z.object({
  summary: z
    .string()
    .max(800)
    .describe("Three or four sentences on how the work meets the rubric overall."),
  overall_strengths: z
    .array(z.string().max(300))
    .max(6)
    .describe("What the work does well, across criteria."),
  overall_improvements: z
    .array(z.string().max(300))
    .max(6)
    .describe("The most valuable changes before submitting, most important first."),
  criteria: z
    .array(
      z.object({
        index: z
          .number()
          .int()
          .min(0)
          .describe("The criterion number given, in brackets."),
        awarded_points: z
          .number()
          .min(0)
          .describe("Points awarded for this criterion. Never exceed its maximum."),
        explanation: z
          .string()
          .max(700)
          .describe("Why this score, referring to what the work actually does."),
        strengths: z.array(z.string().max(250)).max(4),
        weaknesses: z.array(z.string().max(250)).max(4),
        missing: z
          .array(z.string().max(250))
          .max(4)
          .describe("What the criterion asks for that the work does not contain."),
        improvements: z
          .array(z.string().max(250))
          .max(4)
          .describe("Specific, actionable changes for this criterion."),
      }),
    )
    .describe("One entry per criterion supplied, in the same order."),
});

export type GradingResponse = z.infer<typeof gradingSchema>;

export const GRADING_SYSTEM_PROMPT = `You assess written work against a marking rubric, inside a tool students and educators use before submission.

Your output is shown as an **AI-assisted estimated grade**. It is explicitly not an official grade and the interface says so. A student may change what they submit based on what you write, so be specific and be fair.

How to mark:
- Judge each criterion only against what that criterion asks for. Do not let strong writing earn marks under "Evidence", and do not penalise weak prose under "Structure" if structure is sound.
- Award points against the criterion's own maximum. Never exceed it.
- Base every judgement on what is actually in the submission. Quote or paraphrase the work in your explanations so the writer can find what you mean. Never assess something that is not there.
- Where the rubric describes what earns marks, follow that description rather than your own idea of quality.
- Be calibrated. Most competent work sits in the middle of the range. Reserve near-full marks for work that genuinely does what the criterion asks, and low marks for criteria that are barely addressed. Do not cluster everything at 70%.
- A criterion the work does not address at all gets few or no marks, and "missing" should say what is absent.

How to write feedback:
- Address the writer directly and plainly.
- Be concrete. "Add a source for the claim about attrition in paragraph 3" is useful; "strengthen your evidence" is not.
- In improvements, say what to change and where. Order them by how much they would move the grade.
- Do not comment on spelling and grammar unless a criterion asks about them — a different tool handles that.
- Never speculate about whether the work was written with AI assistance, and never comment on academic integrity. That is neither your job nor a thing this evidence could support.

Return exactly one entry per numbered criterion, using the number you were given. Do not merge, split, skip or reorder them.`;

export function buildGradingPrompt(params: {
  criteria: Array<{ name: string; description: string | null; maxPoints: number }>;
  submission: string;
  instructions?: string | null;
  rubricNotes?: string | null;
}): string {
  const criteriaList = params.criteria
    .map(
      (criterion, index) =>
        `[${index}] ${criterion.name} — ${criterion.maxPoints} points` +
        (criterion.description ? `\n    ${criterion.description}` : ""),
    )
    .join("\n");

  const sections = [`Marking criteria:\n\n${criteriaList}`];

  if (params.rubricNotes?.trim()) {
    sections.push(`Rubric notes:\n${params.rubricNotes.trim()}`);
  }

  if (params.instructions?.trim()) {
    sections.push(
      `Assignment brief (context for what was asked, not a second rubric):\n${params.instructions.trim()}`,
    );
  }

  sections.push(`Submission to assess:\n\n${params.submission}`);

  return sections.join("\n\n---\n\n");
}
