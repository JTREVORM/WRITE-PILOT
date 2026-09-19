"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { deriveTitle } from "@/lib/documents/extract";
import { resolveToolInput } from "@/lib/documents/input";
import { runGrammarCheck } from "./service";
import { ok, fail, type ActionResult } from "@/lib/utils/result";
import { toAppError } from "@/lib/utils/errors";
import { routes } from "@/lib/config/routes";
import type { SuggestionStatus } from "@/types/database";

/**
 * Grammar Checker actions.
 *
 * Accepting and rejecting run as the signed-in user rather than through the
 * service role: deciding what to do with a suggestion on your own document is
 * exactly what Row Level Security should be allowed to authorise. The database
 * guard means the only field these can move is `status`.
 */

export async function runGrammarCheckAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const user = await requireUser(routes.grammar);

  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;

  try {
    const input = await resolveToolInput({ userId: user.id, formData });
    const { text, source, filename, documentId, documentTitle } = input;

    if (!text.trim()) {
      return fail(
        hasFile
          ? "We couldn't find any text in that file. If it's a scanned image, try pasting the text instead."
          : "Paste some text or upload a document to check.",
        { code: "empty_input" },
      );
    }

    const title =
      (formData.get("title") ?? "").toString().trim() ||
      documentTitle ||
      deriveTitle({ filename, text });

    // Keyed by content, so a double submit of the same text charges once.
    const idempotencyKey = `grammar:${createHash("sha256")
      .update(`${user.id}:${text}`)
      .digest("hex")
      .slice(0, 48)}`;

    const { checkId } = await runGrammarCheck({
      userId: user.id,
      documentId,
      text,
      title,
      source,
      filename,
      idempotencyKey,
    });

    revalidatePath(routes.grammar);
    redirect(`${routes.grammar}/${checkId}`);
  } catch (error) {
    if (isRedirect(error)) throw error;

    const appError = toAppError(error);
    return fail(appError.message, { code: appError.code });
  }
}

/** redirect() signals by throwing; let that through rather than reporting it. */
function isRedirect(error: unknown): boolean {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    "digest" in (error as object) &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function setSuggestionStatusAction(params: {
  checkId: string;
  suggestionId: string;
  status: SuggestionStatus;
}): Promise<ActionResult<null>> {
  await requireUser();

  const supabase = await createClient();

  // Scoped by RLS to suggestions on the caller's own check; the column guard
  // means nothing but `status` can move even if more were sent.
  const { error } = await supabase
    .from("grammar_suggestions")
    .update({ status: params.status })
    .eq("id", params.suggestionId)
    .eq("check_id", params.checkId);

  if (error) {
    console.error("[grammar] failed to update suggestion", error.message);
    return fail("We couldn't update that suggestion. Please try again.");
  }

  revalidatePath(`${routes.grammar}/${params.checkId}`);
  return ok(null);
}

/** Bulk accept or reset, for "apply all" and "undo all". */
export async function setAllSuggestionsStatusAction(params: {
  checkId: string;
  status: SuggestionStatus;
  /** Only move suggestions currently in this state. */
  from?: SuggestionStatus;
}): Promise<ActionResult<{ updated: number }>> {
  await requireUser();

  const supabase = await createClient();

  let query = supabase
    .from("grammar_suggestions")
    .update({ status: params.status })
    .eq("check_id", params.checkId);

  if (params.from) {
    query = query.eq("status", params.from);
  }

  const { data, error } = await query.select("id");

  if (error) {
    console.error("[grammar] failed to bulk update", error.message);
    return fail("We couldn't update those suggestions. Please try again.");
  }

  revalidatePath(`${routes.grammar}/${params.checkId}`);
  return ok({ updated: data?.length ?? 0 });
}

export async function deleteGrammarCheckAction(
  checkId: string,
): Promise<ActionResult<null>> {
  await requireUser();

  const supabase = await createClient();
  const { error } = await supabase.from("grammar_checks").delete().eq("id", checkId);

  if (error) {
    console.error("[grammar] failed to delete check", error.message);
    return fail("We couldn't delete that check. Please try again.");
  }

  revalidatePath(routes.grammar);
  return ok(null);
}
