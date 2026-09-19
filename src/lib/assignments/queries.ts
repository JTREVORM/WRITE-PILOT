import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type {
  AssignmentDraftRow,
  AssignmentRow,
  DocumentRow,
} from "@/types/database";

/** Reads scoped by Row Level Security to the owner. */

export type AssignmentListItem = Pick<
  AssignmentRow,
  "id" | "title" | "course" | "status" | "due_at" | "created_at"
> & { draft_count: number };

export type DraftWithDocument = AssignmentDraftRow & {
  document: Pick<DocumentRow, "id" | "title" | "word_count" | "source"> | null;
};

export interface AssignmentDetail {
  assignment: AssignmentRow;
  drafts: DraftWithDocument[];
  rubricTitle: string | null;
}

export const listAssignments = cache(
  async (limit = 50): Promise<AssignmentListItem[]> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("assignments")
      .select(
        "id, title, course, status, due_at, created_at, assignment_drafts(id)",
      )
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[assignments] failed to list", error.message);
      return [];
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      course: row.course,
      status: row.status,
      due_at: row.due_at,
      created_at: row.created_at,
      draft_count:
        (row as unknown as { assignment_drafts?: unknown[] }).assignment_drafts
          ?.length ?? 0,
    }));
  },
);

export const getAssignment = cache(
  async (assignmentId: string): Promise<AssignmentDetail | null> => {
    const supabase = await createClient();

    const { data: assignment, error } = await supabase
      .from("assignments")
      .select("*")
      .eq("id", assignmentId)
      .maybeSingle();

    if (error) {
      console.error("[assignments] failed to load", error.message);
      return null;
    }
    if (!assignment) return null;

    const { data: drafts } = await supabase
      .from("assignment_drafts")
      .select("*, document:documents(id, title, word_count, source)")
      .eq("assignment_id", assignmentId)
      .order("version", { ascending: false });

    let rubricTitle: string | null = null;
    if (assignment.rubric_id) {
      const { data: rubric } = await supabase
        .from("rubrics")
        .select("title")
        .eq("id", assignment.rubric_id)
        .maybeSingle();

      rubricTitle = rubric?.title ?? null;
    }

    return {
      assignment,
      drafts: (drafts ?? []) as unknown as DraftWithDocument[],
      rubricTitle,
    };
  },
);
