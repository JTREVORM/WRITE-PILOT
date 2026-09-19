"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { addDocument, removeDocument } from "./service";
import { createDocumentDownloadUrl } from "./storage";
import { ok, fail, type ActionResult } from "@/lib/utils/result";
import { toAppError } from "@/lib/utils/errors";
import { routes } from "@/lib/config/routes";

/**
 * Document library actions.
 *
 * Adding and removing go through the service, because both touch storage and
 * both are decisions the plan has a say in. Renaming does not: a title is the
 * user's own text on their own row, so it runs as them through RLS, and the
 * column guard is what stops it becoming a way to rewrite the document.
 */

export async function addDocumentAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const user = await requireUser(routes.documents);

  try {
    const file = formData.get("file");
    const text = (formData.get("text") ?? "").toString();

    if (!(file instanceof File && file.size > 0) && !text.trim()) {
      return fail("Upload a file or paste some text to add.", {
        code: "empty_input",
      });
    }

    const { documentId } = await addDocument({
      userId: user.id,
      file: file instanceof File ? file : null,
      text,
      title: (formData.get("title") ?? "").toString(),
    });

    revalidatePath(routes.documents);
    redirect(`${routes.documents}/${documentId}`);
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

export async function renameDocumentAction(params: {
  documentId: string;
  title: string;
}): Promise<ActionResult<null>> {
  await requireUser();

  const title = params.title.trim();
  if (!title) return fail("A document needs a name.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("documents")
    .update({ title: title.slice(0, 200) })
    .eq("id", params.documentId);

  if (error) {
    console.error("[documents] failed to rename", error.message);
    return fail("We couldn't save that name. Please try again.");
  }

  revalidatePath(`${routes.documents}/${params.documentId}`);
  revalidatePath(routes.documents);
  return ok(null);
}

export async function deleteDocumentAction(
  documentId: string,
): Promise<ActionResult<null>> {
  const user = await requireUser();

  try {
    await removeDocument({ userId: user.id, documentId });
  } catch (error) {
    const appError = toAppError(error);
    return fail(appError.message, { code: appError.code });
  }

  revalidatePath(routes.documents);
  return ok(null);
}

/**
 * Mints a short-lived download URL.
 *
 * Returned to the browser rather than redirected to, so the caller can open it
 * without the page navigating away — and so a URL that has been minted is one a
 * user asked for, seconds ago, for a file the server has just confirmed is
 * theirs.
 */
export async function getDocumentDownloadUrlAction(
  documentId: string,
): Promise<ActionResult<{ url: string }>> {
  const user = await requireUser();

  const supabase = await createClient();
  const { data: document } = await supabase
    .from("documents")
    .select("id, storage_path, original_filename")
    .eq("id", documentId)
    .maybeSingle();

  if (!document?.storage_path) {
    return fail("That document has no stored file — it was pasted as text.");
  }

  try {
    const url = await createDocumentDownloadUrl({
      path: document.storage_path,
      userId: user.id,
      filename: document.original_filename,
    });

    return ok({ url });
  } catch (error) {
    const appError = toAppError(error);
    return fail(appError.message, { code: appError.code });
  }
}
