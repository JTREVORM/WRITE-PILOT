import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type {
  GradeCriterionRow,
  GradeRow,
  RubricCriterionRow,
  RubricRow,
} from "@/types/database";

/** Reads scoped by Row Level Security to the owner. */

export type RubricListItem = Pick<
  RubricRow,
  "id" | "title" | "total_points" | "created_at"
> & { criteria_count: number };

export interface RubricDetail {
  rubric: RubricRow;
  criteria: RubricCriterionRow[];
}

export type GradeListItem = Pick<
  GradeRow,
  "id" | "title" | "rubric_title" | "estimated_points" | "max_points" | "created_at"
>;

export interface GradeDetail {
  grade: GradeRow;
  criteria: GradeCriterionRow[];
}

export const listRubrics = cache(async (limit = 25): Promise<RubricListItem[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("rubrics")
    .select("id, title, total_points, created_at, rubric_criteria(id)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[grading] failed to list rubrics", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    total_points: row.total_points,
    created_at: row.created_at,
    criteria_count:
      (row as unknown as { rubric_criteria?: unknown[] }).rubric_criteria?.length ?? 0,
  }));
});

export const getRubric = cache(
  async (rubricId: string): Promise<RubricDetail | null> => {
    const supabase = await createClient();

    const { data: rubric, error } = await supabase
      .from("rubrics")
      .select("*")
      .eq("id", rubricId)
      .maybeSingle();

    if (error) {
      console.error("[grading] failed to load rubric", error.message);
      return null;
    }
    if (!rubric) return null;

    const { data: criteria } = await supabase
      .from("rubric_criteria")
      .select("*")
      .eq("rubric_id", rubricId)
      .order("position", { ascending: true });

    return { rubric, criteria: criteria ?? [] };
  },
);

export const listGrades = cache(async (limit = 10): Promise<GradeListItem[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("grades")
    .select("id, title, rubric_title, estimated_points, max_points, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[grading] failed to list grades", error.message);
    return [];
  }

  return data ?? [];
});

export const getGrade = cache(
  async (gradeId: string): Promise<GradeDetail | null> => {
    const supabase = await createClient();

    const { data: grade, error } = await supabase
      .from("grades")
      .select("*")
      .eq("id", gradeId)
      .maybeSingle();

    if (error) {
      console.error("[grading] failed to load grade", error.message);
      return null;
    }
    if (!grade) return null;

    const { data: criteria } = await supabase
      .from("grade_criteria")
      .select("*")
      .eq("grade_id", gradeId)
      .order("position", { ascending: true });

    return { grade, criteria: criteria ?? [] };
  },
);
