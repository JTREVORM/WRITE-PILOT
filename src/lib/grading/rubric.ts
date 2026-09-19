/**
 * Normalising an extracted rubric.
 *
 * Rubrics arrive as prose, tables, bullet lists and scanned handouts, so what
 * comes back from extraction needs tidying before it can be relied on: blank
 * criteria dropped, points made sane, duplicates merged, positions sequential.
 *
 * Pure and deterministic, so the messy cases can be tested directly rather than
 * discovered in production against someone's coursework brief.
 */

import { roundPoints } from "./score.ts";

export interface RawCriterion {
  name: string;
  description?: string | null;
  max_points: number;
}

export interface NormalizedCriterion {
  position: number;
  name: string;
  description: string | null;
  maxPoints: number;
}

export interface NormalizedRubric {
  criteria: NormalizedCriterion[];
  totalPoints: number;
  /** Reasons criteria were dropped — for logging, not for the user. */
  dropped: Array<{ reason: string; name: string }>;
}

/** Upper bound on a single criterion, to reject a misparsed "100 points". */
const MAX_CRITERION_POINTS = 1000;
const MAX_CRITERIA = 40;

function cleanName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\s+/g, " ")
    // Rubric tables often carry the points into the criterion name.
    .replace(/[\s—–-]*\(?\d+(\.\d+)?\s*(points?|pts?|marks?)\)?\s*$/i, "")
    .replace(/[:：]\s*$/, "")
    .trim()
    .slice(0, 200);
}

export function normalizeRubric(raw: RawCriterion[]): NormalizedRubric {
  const criteria: NormalizedCriterion[] = [];
  const dropped: NormalizedRubric["dropped"] = [];
  const seen = new Map<string, number>();

  for (const item of raw) {
    if (criteria.length >= MAX_CRITERIA) {
      dropped.push({ reason: "too_many", name: String(item?.name ?? "") });
      continue;
    }

    const name = cleanName(item?.name);
    if (!name) {
      dropped.push({ reason: "empty_name", name: String(item?.name ?? "") });
      continue;
    }

    const rawPoints = Number(item?.max_points);
    if (!Number.isFinite(rawPoints) || rawPoints < 0) {
      dropped.push({ reason: "invalid_points", name });
      continue;
    }
    if (rawPoints > MAX_CRITERION_POINTS) {
      dropped.push({ reason: "points_out_of_range", name });
      continue;
    }

    const maxPoints = roundPoints(rawPoints);

    // The same criterion listed twice is a parsing artefact, not two criteria.
    // Keep the larger allocation rather than silently halving the weighting.
    const key = name.toLowerCase();
    const existingIndex = seen.get(key);
    if (existingIndex !== undefined) {
      const existing = criteria[existingIndex]!;
      existing.maxPoints = Math.max(existing.maxPoints, maxPoints);
      if (!existing.description && typeof item?.description === "string") {
        existing.description = item.description.trim().slice(0, 1000) || null;
      }
      dropped.push({ reason: "duplicate", name });
      continue;
    }

    seen.set(key, criteria.length);
    criteria.push({
      position: criteria.length,
      name,
      description:
        typeof item?.description === "string"
          ? item.description.trim().slice(0, 1000) || null
          : null,
      maxPoints,
    });
  }

  // Positions are renumbered after any merging, so they stay sequential.
  criteria.forEach((criterion, index) => {
    criterion.position = index;
  });

  return {
    criteria,
    totalPoints: roundPoints(
      criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0),
    ),
    dropped,
  };
}
