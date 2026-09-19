"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/entitlements/service";
import { extractDocumentText, deriveTitle } from "@/lib/documents/extract";
import { runNaturalize } from "./service";
import { DEFAULT_MODE, isNaturalizeMode } from "./modes";
import { ok, fail, type ActionResult } from "@/lib/utils/result";
import { toAppError } from "@/lib/utils/errors";
import { routes } from "@/lib/config/routes";
import type { ScanSource } from "@/types/database";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export async function runNaturalizeAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const user = await requireUser(routes.naturalize);

  const rawMode = (formData.get("mode") ?? "").toString();
  // A tampered mode falls back to the default rather than failing the request.
  const mode = isNaturalizeMode(rawMode) ? rawMode : DEFAULT_MODE;

  let text = (formData.get("text") ?? "").toString();
  let source: ScanSource = "text";
  let filename: string | null = null;

  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;

  try {
    if (hasFile) {
      const entitlements = await getEntitlements(user.id);
      const planLimitBytes = (entitlements.plan?.maxFileSizeMb ?? 5) * 1024 * 1024;

      const extracted = await extractDocumentText(file, {
        maxBytes: Math.min(planLimitBytes, MAX_UPLOAD_BYTES),
      });

      text = extracted.text;
      source = extracted.source;
      filename = extracted.filename;
    }

    if (!text.trim()) {
      return fail(
        hasFile
          ? "We couldn't find any text in that file. If it's a scanned image, try pasting the text instead."
          : "Paste some text or upload a document to improve.",
        { code: "empty_input" },
      );
    }

    const title =
      (formData.get("title") ?? "").toString().trim() ||
      deriveTitle({ filename, text });

    // Keyed by content *and* mode: running the same text in a different mode is
    // a genuinely different request, not a duplicate submission.
    const idempotencyKey = `naturalize:${createHash("sha256")
      .update(`${user.id}:${mode}:${text}`)
      .digest("hex")
      .slice(0, 48)}`;

    const { runId } = await runNaturalize({
      userId: user.id,
      text,
      title,
      mode,
      source,
      filename,
      idempotencyKey,
    });

    revalidatePath(routes.naturalize);
    redirect(`${routes.naturalize}/${runId}`);
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

export async function deleteNaturalizeRunAction(
  runId: string,
): Promise<ActionResult<null>> {
  await requireUser();

  const supabase = await createClient();
  const { error } = await supabase.from("naturalize_runs").delete().eq("id", runId);

  if (error) {
    console.error("[naturalize] failed to delete run", error.message);
    return fail("We couldn't delete that rewrite. Please try again.");
  }

  revalidatePath(routes.naturalize);
  return ok(null);
}
