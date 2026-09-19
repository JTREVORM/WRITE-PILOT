"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/entitlements/service";
import { ok, fail, type ActionResult } from "@/lib/utils/result";
import { routes } from "@/lib/config/routes";
import type { AssignmentStatus } from "@/types/database";

/**
 * Assignment actions.
 *
 * Unlike every other write in this codebase, these run as the signed-in user
 * rather than through the service role. An assignment is wholly user-authored —
 * no credits, no model, nothing derived — so the RLS policies are exactly the
 * right place for the decision, and routing it through a privileged client
 * would only move the authorisation somewhere it could be forgotten.
 *
 * The one thing the policies cannot express is the plan's draft allowance,
 * which is counted here.
 */

const STATUSES: AssignmentStatus[] = ["planning", "drafting", "submitted"];

function readStatus(value: FormDataEntryValue | null): AssignmentStatus {
  const raw = (value ?? "").toString();
  return STATUSES.includes(raw as AssignmentStatus)
    ? (raw as AssignmentStatus)
    : "planning";
}

/** An empty datetime-local field is "no due date", not an invalid date. */
function readDueAt(value: FormDataEntryValue | null): string | null {
  const raw = (value ?? "").toString().trim();
  if (!raw) return null;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function createAssignmentAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const user = await requireUser(routes.assignments);

  const title = (formData.get("title") ?? "").toString().trim();
  if (!title) return fail("An assignment needs a title.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assignments")
    .insert({
      user_id: user.id,
      title: title.slice(0, 200),
      course: (formData.get("course") ?? "").toString().trim().slice(0, 120) || null,
      instructions:
        (formData.get("instructions") ?? "").toString().trim() || null,
      rubric_id: (formData.get("rubricId") ?? "").toString().trim() || null,
      status: readStatus(formData.get("status")),
      due_at: readDueAt(formData.get("dueAt")),
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[assignments] failed to create", error?.message);
    return fail("We couldn't create that assignment. Please try again.");
  }

  revalidatePath(routes.assignments);
  redirect(`${routes.assignments}/${data.id}`);
}

export async function updateAssignmentAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  await requireUser(routes.assignments);

  const assignmentId = (formData.get("assignmentId") ?? "").toString();
  const title = (formData.get("title") ?? "").toString().trim();

  if (!assignmentId) return fail("That assignment couldn't be found.");
  if (!title) return fail("An assignment needs a title.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("assignments")
    .update({
      title: title.slice(0, 200),
      course: (formData.get("course") ?? "").toString().trim().slice(0, 120) || null,
      instructions:
        (formData.get("instructions") ?? "").toString().trim() || null,
      rubric_id: (formData.get("rubricId") ?? "").toString().trim() || null,
      status: readStatus(formData.get("status")),
      due_at: readDueAt(formData.get("dueAt")),
    })
    .eq("id", assignmentId);

  if (error) {
    console.error("[assignments] failed to update", error.message);
    return fail("We couldn't save those changes. Please try again.");
  }

  revalidatePath(`${routes.assignments}/${assignmentId}`);
  revalidatePath(routes.assignments);
  return ok(null);
}

export async function deleteAssignmentAction(
  assignmentId: string,
): Promise<ActionResult<null>> {
  await requireUser();

  const supabase = await createClient();
  const { error } = await supabase
    .from("assignments")
    .delete()
    .eq("id", assignmentId);

  if (error) {
    console.error("[assignments] failed to delete", error.message);
    return fail("We couldn't delete that assignment. Please try again.");
  }

  revalidatePath(routes.assignments);
  return ok(null);
}

/**
 * Attaches a document as the next draft.
 *
 * The version number is derived, not supplied: it is one past the highest
 * already attached, so drafts are numbered in the order they were added and a
 * client cannot renumber them. The insert policy checks that both the
 * assignment and the document belong to the caller.
 */
export async function attachDraftAction(params: {
  assignmentId: string;
  documentId: string;
  note?: string | null;
}): Promise<ActionResult<null>> {
  const user = await requireUser();

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("assignment_drafts")
    .select("version, document_id")
    .eq("assignment_id", params.assignmentId)
    .order("version", { ascending: false });

  const drafts = existing ?? [];

  if (drafts.some((draft) => draft.document_id === params.documentId)) {
    return fail("That document is already a draft of this assignment.");
  }

  const entitlements = await getEntitlements(user.id);
  const maxVersions = entitlements.plan?.maxDocumentVersions ?? null;

  if (maxVersions !== null && drafts.length >= maxVersions) {
    return fail(
      `Your plan keeps ${maxVersions} drafts per assignment. Remove one, or upgrade for more.`,
    );
  }

  const nextVersion = (drafts[0]?.version ?? 0) + 1;

  const { error } = await supabase.from("assignment_drafts").insert({
    assignment_id: params.assignmentId,
    document_id: params.documentId,
    version: nextVersion,
    note: params.note?.trim().slice(0, 500) || null,
  });

  if (error) {
    console.error("[assignments] failed to attach draft", error.message);
    return fail("We couldn't attach that document. Please try again.");
  }

  revalidatePath(`${routes.assignments}/${params.assignmentId}`);
  return ok(null);
}

export async function detachDraftAction(params: {
  assignmentId: string;
  draftId: string;
}): Promise<ActionResult<null>> {
  await requireUser();

  const supabase = await createClient();
  const { error } = await supabase
    .from("assignment_drafts")
    .delete()
    .eq("id", params.draftId)
    .eq("assignment_id", params.assignmentId);

  if (error) {
    console.error("[assignments] failed to detach draft", error.message);
    return fail("We couldn't remove that draft. Please try again.");
  }

  revalidatePath(`${routes.assignments}/${params.assignmentId}`);
  return ok(null);
}
