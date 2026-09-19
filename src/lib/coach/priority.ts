/**
 * What to do first.
 *
 * A model asked to review a document will happily return thirty things to fix,
 * in the order it happened to notice them. That is a list, not advice: the
 * student with one evening before a deadline needs to know which three changes
 * are worth that evening.
 *
 * So the ordering is ours. The model judges two things per improvement — how
 * much it would improve the work, and how much work it is — and the arithmetic
 * that turns those into a rank happens here, deterministically, where it can be
 * read and tested. A model that also volunteered a priority would be scoring
 * its own homework.
 */

export interface Weighted {
  /** 1–5. How much the work improves if this is done. */
  impact: number;
  /** 1–5. How much effort it takes. */
  effort: number;
}

export interface PriorityBand {
  key: "first" | "worthwhile" | "optional";
  label: string;
  summary: string;
}

/** Keeps a model's number inside the range the interface can render. */
export function clampRating(value: number): number {
  if (!Number.isFinite(value)) return 3;
  return Math.min(5, Math.max(1, Math.round(value)));
}

/**
 * The score everything is ordered by.
 *
 * Impact dominates and effort only breaks ties: between a large improvement
 * that takes an hour and a small one that takes a minute, the large one is
 * still the better use of the hour. Effort is weighted enough that two
 * improvements of equal impact are ordered by which is quicker, which is the
 * question a person actually asks next.
 *
 * Range is 50 - 15 = 35 down to 10 - 3 = 7.
 */
export function priorityScore(item: Weighted): number {
  return clampRating(item.impact) * 10 - clampRating(item.effort) * 3;
}

export function bandFor(score: number): PriorityBand {
  if (score >= 32) {
    return {
      key: "first",
      label: "Do this first",
      summary: "A large improvement for the time it takes.",
    };
  }

  if (score >= 20) {
    return {
      key: "worthwhile",
      label: "Worth doing",
      summary: "A real improvement, once the bigger ones are done.",
    };
  }

  return {
    key: "optional",
    label: "If you have time",
    summary: "A small gain, or a large amount of work for the gain.",
  };
}

/**
 * Orders improvements for display.
 *
 * Highest score first. Ties go to the measured ones — a count of unresolved
 * grammar suggestions is a fact, and a fact outranks an opinion of equal
 * weight. Remaining ties keep the order they arrived in, so the sort is stable
 * and two runs of the same analysis read the same way.
 */
export function orderActions<
  T extends Weighted & { measured?: boolean; position?: number },
>(actions: T[]): T[] {
  return [...actions]
    .map((action, index) => ({ action, index }))
    .sort((a, b) => {
      const scoreDelta = priorityScore(b.action) - priorityScore(a.action);
      if (scoreDelta !== 0) return scoreDelta;

      const measuredDelta =
        Number(Boolean(b.action.measured)) - Number(Boolean(a.action.measured));
      if (measuredDelta !== 0) return measuredDelta;

      return a.index - b.index;
    })
    .map(({ action }) => action);
}

export const IMPROVEMENT_CATEGORIES = [
  "structure",
  "argument",
  "evidence",
  "clarity",
  "mechanics",
  "citations",
  "formatting",
] as const;

export type ImprovementCategory = (typeof IMPROVEMENT_CATEGORIES)[number];

export function isImprovementCategory(
  value: unknown,
): value is ImprovementCategory {
  return (
    typeof value === "string" &&
    (IMPROVEMENT_CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * The standing qualification on a coaching run.
 *
 * The coach reads a draft and suggests changes. It does not know the marker,
 * the module, or what was asked for beyond what it was given — and a student
 * who followed advice that contradicted their brief would have been failed by
 * this tool, not helped.
 */
export const COACH_DISCLAIMER =
  "This is advice on a draft, not a mark and not a rule. It reads what you " +
  "gave it and nothing else — where it disagrees with your brief or your " +
  "supervisor, they are right and it is wrong.";
