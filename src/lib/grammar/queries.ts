import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { GrammarCheckRow, GrammarSuggestionRow } from "@/types/database";

/**
 * Grammar check reads.
 *
 * Through the user's own client, so Row Level Security scopes every result to
 * its owner. As with detection scans, there is no admin read path over the
 * user's writing.
 */

export type GrammarCheckListItem = Pick<
  GrammarCheckRow,
  "id" | "title" | "source" | "word_count" | "created_at"
> & { suggestion_count: number; pending_count: number };

export interface GrammarCheckDetail {
  check: GrammarCheckRow;
  suggestions: GrammarSuggestionRow[];
}

export const listGrammarChecks = cache(
  async (limit = 10): Promise<GrammarCheckListItem[]> => {
    const supabase = await createClient();

    // One round trip: the counts come back nested and are flattened below.
    const { data, error } = await supabase
      .from("grammar_checks")
      .select(
        "id, title, source, word_count, created_at, grammar_suggestions(status)",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[grammar] failed to list checks", error.message);
      return [];
    }

    return (data ?? []).map((row) => {
      const suggestions =
        (row as unknown as { grammar_suggestions?: Array<{ status: string }> })
          .grammar_suggestions ?? [];

      return {
        id: row.id,
        title: row.title,
        source: row.source,
        word_count: row.word_count,
        created_at: row.created_at,
        suggestion_count: suggestions.length,
        pending_count: suggestions.filter((s) => s.status === "pending").length,
      };
    });
  },
);

export const getGrammarCheck = cache(
  async (checkId: string): Promise<GrammarCheckDetail | null> => {
    const supabase = await createClient();

    const { data: check, error } = await supabase
      .from("grammar_checks")
      .select("*")
      .eq("id", checkId)
      .maybeSingle();

    if (error) {
      console.error("[grammar] failed to load check", error.message);
      return null;
    }
    if (!check) return null;

    const { data: suggestions } = await supabase
      .from("grammar_suggestions")
      .select("*")
      .eq("check_id", checkId)
      .order("start_offset", { ascending: true });

    return { check, suggestions: suggestions ?? [] };
  },
);
