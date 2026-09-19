import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type {
  CitationCheckRow,
  CitationEntryRow,
  CitationFindingRow,
} from "@/types/database";

/** Reads scoped by Row Level Security to the owner. */

export type CitationCheckListItem = Pick<
  CitationCheckRow,
  | "id"
  | "title"
  | "style"
  | "reference_count"
  | "in_text_count"
  | "created_at"
>;

export interface CitationCheckDetail {
  check: CitationCheckRow;
  entries: CitationEntryRow[];
  findings: CitationFindingRow[];
}

export const listCitationChecks = cache(
  async (limit = 10): Promise<CitationCheckListItem[]> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("citation_checks")
      .select("id, title, style, reference_count, in_text_count, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[citations] failed to list checks", error.message);
      return [];
    }

    return data ?? [];
  },
);

export const getCitationCheck = cache(
  async (checkId: string): Promise<CitationCheckDetail | null> => {
    const supabase = await createClient();

    const { data: check, error } = await supabase
      .from("citation_checks")
      .select("*")
      .eq("id", checkId)
      .maybeSingle();

    if (error) {
      console.error("[citations] failed to load check", error.message);
      return null;
    }
    if (!check) return null;

    const [{ data: entries }, { data: findings }] = await Promise.all([
      supabase
        .from("citation_entries")
        .select("*")
        .eq("check_id", checkId)
        .order("position", { ascending: true }),
      supabase
        .from("citation_findings")
        .select("*")
        .eq("check_id", checkId)
        .order("position", { ascending: true }),
    ]);

    return { check, entries: entries ?? [], findings: findings ?? [] };
  },
);
