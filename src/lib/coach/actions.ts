"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { deriveTitle } from "@/lib/documents/extract";
import { resolveToolInput } from "@/lib/documents/input";
import { coachImprovement, runDeepAnalysis } from "./service";
import { ok, fail, type ActionResult } from "@/lib/utils/result";
import { toAppError } from "@/lib/utils/errors";
import { routes } from "@/lib/config/routes";
import type { ImprovementStatus } from "@/types/database";

export async function runAnalysisAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const user = await requireUser(routes.coach);

  try {
    const input = await resolveToolInput({ userId: user.id, formData });

    if (!input.text.trim()) {
      return fail("Paste your draft, upload it, or pick one from your library.", {
        code: "empty_input",
      });
    }

    const title =
      (formData.get("title") ?? "").toString().trim() ||
      input.documentTitle ||
      deriveTitle({ filename: input.filename, text: input.text });

    const assignmentId =
      (formData.get("assignmentId") ?? "").toString().trim() || null;

    // Keyed by content and by the assignment it was reviewed against: the same
    // draft read against a different brief is a genuinely different review.
    const idempotencyKey = `analysis:${createHash("sha256")
      .update(`${user.id}:${assignmentId ?? ""}:${input.text}`)
      .digest("hex")
      .slice(0, 48)}`;

    const { analysisId } = await runDeepAnalysis({
      userId: user.id,
      documentId: input.documentId,
      assignmentId,
      text: input.text,
      title,
      source: input.source,
      filename: input.filename,
      idempotencyKey,
    });

    revalidatePath(routes.coach);
    redirect(`${routes.coach}/${analysisId}`);
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
 * Buys a coaching explanation for one improvement.
 *
 * Charged per improvement rather than per review, because "what should I do"
 * and "I don't understand what you mean" are different questions. An
 * explanation already bought is handed back without charging again.
 */
export async function coachActionAction(params: {
  analysisId: string;
  actionId: string;
}): Promise<ActionResult<{ coaching: string; charged: boolean }>> {
  const user = await requireUser();

  try {
    const result = await coachImprovement({
      userId: user.id,
      actionId: params.actionId,
      idempotencyKey: `coach:${params.actionId}`,
    });

    revalidatePath(`${routes.coach}/${params.analysisId}`);
    return ok(result);
  } catch (error) {
    const appError = toAppError(error);
    return fail(appError.message, { code: appError.code });
  }
}

export async function setImprovementStatusAction(params: {
  analysisId: string;
  actionId: string;
  status: ImprovementStatus;
}): Promise<ActionResult<null>> {
  await requireUser();

  if (!["open", "done", "dismissed"].includes(params.status)) {
    return fail("That is not a status an improvement can have.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("improvement_actions")
    .update({ status: params.status })
    .eq("id", params.actionId)
    .eq("analysis_id", params.analysisId);

  if (error) {
    console.error("[coach] failed to update improvement", error.message);
    return fail("We couldn't save that. Please try again.");
  }

  revalidatePath(`${routes.coach}/${params.analysisId}`);
  return ok(null);
}

export async function deleteAnalysisAction(
  analysisId: string,
): Promise<ActionResult<null>> {
  await requireUser();

  const supabase = await createClient();
  const { error } = await supabase
    .from("analysis_runs")
    .delete()
    .eq("id", analysisId);

  if (error) {
    console.error("[coach] failed to delete analysis", error.message);
    return fail("We couldn't delete that review. Please try again.");
  }

  revalidatePath(routes.coach);
  return ok(null);
}
