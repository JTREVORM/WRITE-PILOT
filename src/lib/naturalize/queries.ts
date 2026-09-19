import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type {
  NaturalizeParagraphRow,
  NaturalizeRunRow,
} from "@/types/database";

/** Reads scoped by Row Level Security to the run's owner. */

export type NaturalizeListItem = Pick<
  NaturalizeRunRow,
  "id" | "title" | "mode" | "source" | "word_count" | "improved_word_count" | "created_at"
>;

export interface NaturalizeDetail {
  run: NaturalizeRunRow;
  paragraphs: NaturalizeParagraphRow[];
}

export const listNaturalizeRuns = cache(
  async (limit = 10): Promise<NaturalizeListItem[]> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("naturalize_runs")
      .select(
        "id, title, mode, source, word_count, improved_word_count, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[naturalize] failed to list runs", error.message);
      return [];
    }

    return data ?? [];
  },
);

export const getNaturalizeRun = cache(
  async (runId: string): Promise<NaturalizeDetail | null> => {
    const supabase = await createClient();

    const { data: run, error } = await supabase
      .from("naturalize_runs")
      .select("*")
      .eq("id", runId)
      .maybeSingle();

    if (error) {
      console.error("[naturalize] failed to load run", error.message);
      return null;
    }
    if (!run) return null;

    const { data: paragraphs } = await supabase
      .from("naturalize_paragraphs")
      .select("*")
      .eq("run_id", runId)
      .order("position", { ascending: true });

    return { run, paragraphs: paragraphs ?? [] };
  },
);
