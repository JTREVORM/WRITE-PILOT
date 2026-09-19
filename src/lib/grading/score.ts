/**
 * Grade arithmetic and framing.
 *
 * Two rules drive this module.
 *
 * First, **the totals are ours**. A model is asked to judge each criterion; it
 * is never asked to add them up, and a total it volunteers is discarded. Models
 * are unreliable at arithmetic and a grade that does not equal the sum of its
 * parts destroys trust in the whole breakdown.
 *
 * Second, **nothing here is an academic grade**. The wording is fixed in one
 * place so no screen can quietly present an estimate as a mark. There is no
 * letter-grade conversion, deliberately: letter boundaries vary by institution,
 * and inventing one would dress a guess up as a registrar's decision.
 */

export interface CriterionScore {
  awardedPoints: number;
  maxPoints: number;
}

export interface GradeTotal {
  awarded: number;
  max: number;
  /** 0-100, or null when the rubric carries no points at all. */
  percentage: number | null;
}

/** Two decimal places — half and quarter marks are common in real rubrics. */
export function roundPoints(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * Clamps an awarded score into the range the criterion actually allows.
 *
 * A model returning 12 out of 10, or a negative score, is not a reason to fail
 * the whole grading run — but it must never reach the database, where a check
 * constraint would reject it and lose the user's paid-for analysis.
 */
export function clampAwarded(awarded: number, maxPoints: number): number {
  const max = Math.max(0, roundPoints(maxPoints));
  if (!Number.isFinite(awarded) || awarded < 0) return 0;
  return roundPoints(Math.min(awarded, max));
}

export function totalFor(criteria: CriterionScore[]): GradeTotal {
  let awarded = 0;
  let max = 0;

  for (const criterion of criteria) {
    const criterionMax = Math.max(0, roundPoints(criterion.maxPoints));
    awarded += clampAwarded(criterion.awardedPoints, criterionMax);
    max += criterionMax;
  }

  awarded = roundPoints(awarded);
  max = roundPoints(max);

  return {
    awarded,
    max,
    percentage: max > 0 ? roundPoints((awarded / max) * 100) : null,
  };
}

export interface GradeBand {
  key: "strong" | "solid" | "developing" | "weak";
  /** Describes the work against the rubric, not the student. */
  label: string;
  summary: string;
  tone: "success" | "neutral" | "warning" | "danger";
}

/**
 * A plain-language reading of the percentage.
 *
 * Describes how the work sits against the rubric's own criteria. It does not
 * translate to a letter or a classification, because those boundaries belong to
 * an institution and this number is an estimate.
 */
export function bandFor(percentage: number | null): GradeBand {
  if (percentage === null) {
    return {
      key: "developing",
      label: "Not scored",
      summary: "This rubric has no points attached, so only the written feedback applies.",
      tone: "neutral",
    };
  }

  if (percentage >= 80) {
    return {
      key: "strong",
      label: "Meets the rubric well",
      summary:
        "The work addresses most criteria substantially. The improvements below are refinements rather than gaps.",
      tone: "success",
    };
  }

  if (percentage >= 65) {
    return {
      key: "solid",
      label: "Meets most criteria",
      summary:
        "The work covers the main requirements, with specific criteria that would repay more attention.",
      tone: "neutral",
    };
  }

  if (percentage >= 50) {
    return {
      key: "developing",
      label: "Partly meets the rubric",
      summary:
        "Several criteria are addressed only briefly or not at all. The breakdown shows which ones.",
      tone: "warning",
    };
  }

  return {
    key: "weak",
    label: "Significant gaps against the rubric",
    summary:
      "Much of what the rubric asks for is missing or thin. The breakdown is the place to start.",
    tone: "danger",
  };
}

/**
 * The standing disclaimer.
 *
 * Appears with every estimated grade. A number out of 100 looks exactly like a
 * mark, which is precisely why the qualification has to travel with it rather
 * than sit behind a link.
 */
export const GRADE_DISCLAIMER =
  "This is an AI-assisted estimated grade, produced by reading your work " +
  "against the rubric you supplied. It is not an official grade, it does not " +
  "predict how your work will be marked, and a real marker may weigh the " +
  "criteria quite differently. Use it to find gaps before you submit.";

export const ESTIMATED_GRADE_LABEL = "AI-assisted estimated grade";

/** Minimum input worth grading. */
export const MIN_WORDS_FOR_GRADING = 100;
