import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { routes } from "@/lib/config/routes";
import type { DocumentRow } from "@/types/database";

/** Reads scoped by Row Level Security to the owner. */

export type DocumentListItem = Pick<
  DocumentRow,
  | "id"
  | "title"
  | "source"
  | "word_count"
  | "byte_size"
  | "storage_path"
  | "created_at"
>;

/** One analysis run against a document, whichever tool produced it. */
export interface DocumentAnalysis {
  id: string;
  tool: "detection" | "grammar" | "naturalize" | "grading" | "citations";
  label: string;
  href: string;
  title: string;
  createdAt: string;
  detail: string | null;
}

export const listDocuments = cache(
  async (limit = 50): Promise<DocumentListItem[]> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("documents")
      .select("id, title, source, word_count, byte_size, storage_path, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[documents] failed to list", error.message);
      return [];
    }

    return data ?? [];
  },
);

export const countDocuments = cache(async (): Promise<number> => {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true });

  if (error) {
    console.error("[documents] failed to count", error.message);
    return 0;
  }

  return count ?? 0;
});

export const getDocument = cache(
  async (documentId: string): Promise<DocumentRow | null> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .maybeSingle();

    if (error) {
      console.error("[documents] failed to load", error.message);
      return null;
    }

    return data ?? null;
  },
);

/**
 * Everything that has been run against one document.
 *
 * Five separate queries rather than a view: each analysis table has its own
 * shape and its own idea of what is worth showing in a list, and a view that
 * flattened them would have to pick one. They run in parallel and are merged
 * newest-first.
 */
export const listDocumentAnalyses = cache(
  async (documentId: string): Promise<DocumentAnalysis[]> => {
    const supabase = await createClient();

    const [scans, grammar, naturalize, grades, citations] = await Promise.all([
      supabase
        .from("ai_scans")
        .select("id, title, estimated_ai_likelihood, created_at")
        .eq("document_id", documentId),
      supabase
        .from("grammar_checks")
        .select("id, title, created_at")
        .eq("document_id", documentId),
      supabase
        .from("naturalize_runs")
        .select("id, title, mode, created_at")
        .eq("document_id", documentId),
      supabase
        .from("grades")
        .select("id, title, estimated_points, max_points, created_at")
        .eq("document_id", documentId),
      supabase
        .from("citation_checks")
        .select("id, title, reference_count, created_at")
        .eq("document_id", documentId),
    ]);

    const analyses: DocumentAnalysis[] = [
      ...(scans.data ?? []).map((row) => ({
        id: row.id,
        tool: "detection" as const,
        label: "AI Detector",
        href: `${routes.aiDetector}/${row.id}`,
        title: row.title,
        createdAt: row.created_at,
        detail: `${Math.round(Number(row.estimated_ai_likelihood))}% estimated likelihood`,
      })),
      ...(grammar.data ?? []).map((row) => ({
        id: row.id,
        tool: "grammar" as const,
        label: "Grammar Checker",
        href: `${routes.grammar}/${row.id}`,
        title: row.title,
        createdAt: row.created_at,
        detail: null,
      })),
      ...(naturalize.data ?? []).map((row) => ({
        id: row.id,
        tool: "naturalize" as const,
        label: "Naturalize",
        href: `${routes.naturalize}/${row.id}`,
        title: row.title,
        createdAt: row.created_at,
        detail: row.mode,
      })),
      ...(grades.data ?? []).map((row) => ({
        id: row.id,
        tool: "grading" as const,
        label: "AI Grader",
        href: `${routes.grader}/${row.id}`,
        title: row.title,
        createdAt: row.created_at,
        detail: `${Number(row.estimated_points)} / ${Number(row.max_points)} estimated`,
      })),
      ...(citations.data ?? []).map((row) => ({
        id: row.id,
        tool: "citations" as const,
        label: "Citation Checker",
        href: `${routes.citations}/${row.id}`,
        title: row.title,
        createdAt: row.created_at,
        detail: `${row.reference_count} references`,
      })),
    ];

    return analyses.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
);
