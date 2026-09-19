"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/entitlements/service";
import { extractDocumentText, deriveTitle } from "@/lib/documents/extract";
import { resolveToolInput } from "@/lib/documents/input";
import { extractRubric, gradeSubmission } from "./service";
import { ok, fail, type ActionResult } from "@/lib/utils/result";
import { toAppError } from "@/lib/utils/errors";
import { routes } from "@/lib/config/routes";
import type { ScanSource } from "@/types/database";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Turns whichever of text/file the form supplied into text. */
async function resolveInput(
  userId: string,
  formData: FormData,
  textField: string,
  fileField: string,
): Promise<{ text: string; source: ScanSource; filename: string | null }> {
  const file = formData.get(fileField);

  if (file instanceof File && file.size > 0) {
    const entitlements = await getEntitlements(userId);
    const planLimitBytes = (entitlements.plan?.maxFileSizeMb ?? 5) * 1024 * 1024;

    const extracted = await extractDocumentText(file, {
      maxBytes: Math.min(planLimitBytes, MAX_UPLOAD_BYTES),
    });

    return {
      text: extracted.text,
      source: extracted.source,
      filename: extracted.filename,
    };
  }

  return {
    text: (formData.get(textField) ?? "").toString(),
    source: "text",
    filename: null,
  };
}

export async function extractRubricAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const user = await requireUser(routes.grader);

  try {
    const input = await resolveInput(user.id, formData, "rubricText", "rubricFile");

    if (!input.text.trim()) {
      return fail("Paste your rubric or upload it as a file.", {
        code: "empty_input",
      });
    }

    const idempotencyKey = `rubric:${createHash("sha256")
      .update(`${user.id}:${input.text}`)
      .digest("hex")
      .slice(0, 48)}`;

    const { rubricId } = await extractRubric({
      userId: user.id,
      rawText: input.text,
      title: (formData.get("rubricTitle") ?? "").toString().trim() || null,
      source: input.source,
      filename: input.filename,
      idempotencyKey,
    });

    revalidatePath(routes.grader);
    redirect(`${routes.grader}/rubrics/${rubricId}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    const appError = toAppError(error);
    return fail(appError.message, { code: appError.code });
  }
}

export async function gradeSubmissionAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const user = await requireUser(routes.grader);

  const rubricId = (formData.get("rubricId") ?? "").toString();
  if (!rubricId) {
    return fail("Choose a rubric to grade against.", { code: "no_rubric" });
  }

  try {
    const input = await resolveToolInput({ userId: user.id, formData });

    if (!input.text.trim()) {
      return fail("Paste the submission or upload it as a file.", {
        code: "empty_input",
      });
    }

    const instructions = (formData.get("instructions") ?? "").toString().trim();
    const title =
      (formData.get("title") ?? "").toString().trim() ||
      deriveTitle({ filename: input.filename, text: input.text });

    // Keyed by rubric and content: grading the same work against a different
    // rubric is a genuinely different request.
    const idempotencyKey = `grade:${createHash("sha256")
      .update(`${user.id}:${rubricId}:${input.text}`)
      .digest("hex")
      .slice(0, 48)}`;

    const { gradeId } = await gradeSubmission({
      userId: user.id,
      documentId: input.documentId,
      rubricId,
      text: input.text,
      title,
      instructions: instructions || null,
      source: input.source,
      filename: input.filename,
      idempotencyKey,
    });

    revalidatePath(routes.grader);
    redirect(`${routes.grader}/${gradeId}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    const appError = toAppError(error);
    return fail(appError.message, { code: appError.code });
  }
}

function isRedirect(error: unknown): boolean {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    "digest" in (error as object) &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

/**
 * Corrects an extracted criterion.
 *
 * Runs as the user: adjusting a criterion on your own rubric is exactly what
 * RLS should authorise. The column guard means only name, description and
 * points can move — a criterion cannot be grafted onto another rubric.
 */
export async function updateCriterionAction(params: {
  rubricId: string;
  criterionId: string;
  name: string;
  description: string | null;
  maxPoints: number;
}): Promise<ActionResult<null>> {
  await requireUser();

  const name = params.name.trim();
  if (!name) return fail("A criterion needs a name.");

  if (!Number.isFinite(params.maxPoints) || params.maxPoints < 0) {
    return fail("Points must be zero or more.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("rubric_criteria")
    .update({
      name: name.slice(0, 200),
      description: params.description?.trim().slice(0, 1000) || null,
      max_points: Math.round(params.maxPoints * 100) / 100,
    })
    .eq("id", params.criterionId)
    .eq("rubric_id", params.rubricId);

  if (error) {
    console.error("[grading] failed to update criterion", error.message);
    return fail("We couldn't save that change. Please try again.");
  }

  revalidatePath(`${routes.grader}/rubrics/${params.rubricId}`);
  return ok(null);
}

export async function deleteRubricAction(
  rubricId: string,
): Promise<ActionResult<null>> {
  await requireUser();

  const supabase = await createClient();
  const { error } = await supabase.from("rubrics").delete().eq("id", rubricId);

  if (error) {
    console.error("[grading] failed to delete rubric", error.message);
    return fail("We couldn't delete that rubric. Please try again.");
  }

  revalidatePath(routes.grader);
  return ok(null);
}

export async function deleteGradeAction(
  gradeId: string,
): Promise<ActionResult<null>> {
  await requireUser();

  const supabase = await createClient();
  const { error } = await supabase.from("grades").delete().eq("id", gradeId);

  if (error) {
    console.error("[grading] failed to delete grade", error.message);
    return fail("We couldn't delete that grade. Please try again.");
  }

  revalidatePath(routes.grader);
  return ok(null);
}
