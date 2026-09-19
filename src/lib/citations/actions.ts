"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { deriveTitle } from "@/lib/documents/extract";
import { resolveToolInput } from "@/lib/documents/input";
import { checkCitations } from "./service";
import { isCitationStyle } from "./styles";
import { ok, fail, type ActionResult } from "@/lib/utils/result";
import { toAppError } from "@/lib/utils/errors";
import { routes } from "@/lib/config/routes";
import type { CitationFindingStatus } from "@/types/database";

export async function checkCitationsAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const user = await requireUser(routes.citations);

  try {
    const input = await resolveToolInput({
      userId: user.id,
      formData,
      textField: "documentText",
      fileField: "documentFile",
    });

    if (!input.text.trim()) {
      return fail("Paste your document or upload it as a file.", {
        code: "empty_input",
      });
    }

    const styleValue = (formData.get("style") ?? "").toString();
    if (!isCitationStyle(styleValue)) {
      return fail("Choose the citation style to check against.");
    }

    const title =
      (formData.get("title") ?? "").toString().trim() ||
      input.documentTitle ||
      deriveTitle({ filename: input.filename, text: input.text });

    // The same document checked against the same style is the same work; a
    // double-submitted form must not be charged twice.
    const idempotencyKey = `citations:${createHash("sha256")
      .update(`${user.id}:${styleValue}:${input.text}`)
      .digest("hex")
      .slice(0, 48)}`;

    const { checkId } = await checkCitations({
      userId: user.id,
      documentId: input.documentId,
      text: input.text,
      title,
      style: styleValue,
      source: input.source,
      filename: input.filename,
      idempotencyKey,
    });

    revalidatePath(routes.citations);
    redirect(`${routes.citations}/${checkId}`);
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
 * Marks a finding resolved or dismissed.
 *
 * Runs as the user: working through your own report is exactly what RLS should
 * authorise. The column guard is what makes that safe — status is the only
 * column a user session can move, so this cannot become a way to rewrite what
 * the checker found.
 */
export async function updateFindingStatusAction(params: {
  checkId: string;
  findingId: string;
  status: CitationFindingStatus;
}): Promise<ActionResult<null>> {
  await requireUser();

  if (!["open", "resolved", "dismissed"].includes(params.status)) {
    return fail("That is not a status a finding can have.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("citation_findings")
    .update({ status: params.status })
    .eq("id", params.findingId)
    .eq("check_id", params.checkId);

  if (error) {
    console.error("[citations] failed to update finding", error.message);
    return fail("We couldn't save that. Please try again.");
  }

  revalidatePath(`${routes.citations}/${params.checkId}`);
  return ok(null);
}

export async function deleteCitationCheckAction(
  checkId: string,
): Promise<ActionResult<null>> {
  await requireUser();

  const supabase = await createClient();
  const { error } = await supabase.from("citation_checks").delete().eq("id", checkId);

  if (error) {
    console.error("[citations] failed to delete check", error.message);
    return fail("We couldn't delete that check. Please try again.");
  }

  revalidatePath(routes.citations);
  return ok(null);
}
