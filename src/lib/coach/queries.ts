import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { AnalysisRunRow, ImprovementActionRow } from "@/types/database";

/** Reads scoped by Row Level Security to the owner. */

export type AnalysisListItem = Pick<
  AnalysisRunRow,
  "id" | "title" | "word_count" | "created_at"
> & { open_actions: number; total_actions: number };

export interface AnalysisDetail {
  run: AnalysisRunRow;
  actions: ImprovementActionRow[];
}

export const listAnalyses = cache(
  async (limit = 10): Promise<AnalysisListItem[]> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("analysis_runs")
      .select("id, title, word_count, created_at, improvement_actions(status)")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[coach] failed to list analyses", error.message);
      return [];
    }

    return (data ?? []).map((row) => {
      const actions =
        (row as unknown as { improvement_actions?: Array<{ status: string }> })
          .improvement_actions ?? [];

      return {
        id: row.id,
        title: row.title,
        word_count: row.word_count,
        created_at: row.created_at,
        total_actions: actions.length,
        open_actions: actions.filter((action) => action.status === "open").length,
      };
    });
  },
);

export const getAnalysis = cache(
  async (analysisId: string): Promise<AnalysisDetail | null> => {
    const supabase = await createClient();

    const { data: run, error } = await supabase
      .from("analysis_runs")
      .select("*")
      .eq("id", analysisId)
      .maybeSingle();

    if (error) {
      console.error("[coach] failed to load analysis", error.message);
      return null;
    }
    if (!run) return null;

    const { data: actions } = await supabase
      .from("improvement_actions")
      .select("*")
      .eq("analysis_id", analysisId)
      .order("priority_score", { ascending: false })
      .order("position", { ascending: true });

    return { run, actions: actions ?? [] };
  },
);
