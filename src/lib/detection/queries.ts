import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { AiScanRow, AiScanSegmentRow } from "@/types/database";

/**
 * Scan reads.
 *
 * Through the user's own client, so Row Level Security scopes every result to
 * its owner. These rows hold the user's document text; there is no admin read
 * path by design.
 */

export type ScanListItem = Pick<
  AiScanRow,
  | "id"
  | "title"
  | "source"
  | "word_count"
  | "estimated_ai_likelihood"
  | "confidence"
  | "created_at"
>;

export type ScanSegment = Pick<
  AiScanSegmentRow,
  "id" | "position" | "start_offset" | "end_offset" | "estimated_ai_likelihood" | "rationale"
>;

export interface ScanDetail {
  scan: AiScanRow;
  segments: ScanSegment[];
}

export const listScans = cache(
  async (limit = 20): Promise<ScanListItem[]> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("ai_scans")
      .select(
        "id, title, source, word_count, estimated_ai_likelihood, confidence, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[detection] failed to list scans", error.message);
      return [];
    }

    return data ?? [];
  },
);

export const getScan = cache(
  async (scanId: string): Promise<ScanDetail | null> => {
    const supabase = await createClient();

    const { data: scan, error } = await supabase
      .from("ai_scans")
      .select("*")
      .eq("id", scanId)
      .maybeSingle();

    if (error) {
      console.error("[detection] failed to load scan", error.message);
      return null;
    }
    if (!scan) return null;

    const { data: segments } = await supabase
      .from("ai_scan_segments")
      .select(
        "id, position, start_offset, end_offset, estimated_ai_likelihood, rationale",
      )
      .eq("scan_id", scanId)
      .order("position", { ascending: true });

    return { scan, segments: segments ?? [] };
  },
);

export const countScans = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("ai_scans")
    .select("id", { count: "exact", head: true });

  if (error) {
    console.error("[detection] failed to count scans", error.message);
    return 0;
  }
  return count ?? 0;
});
