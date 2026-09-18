"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/entitlements/service";
import { extractDocumentText, deriveTitle } from "@/lib/documents/extract";
import { runDetectionScan } from "./service";
import { ok, fail, type ActionResult } from "@/lib/utils/result";
import { toAppError } from "@/lib/utils/errors";
import { routes } from "@/lib/config/routes";
import type { ScanSource } from "@/types/database";

/**
 * AI Detector actions.
 *
 * The action decides nothing about entitlements or cost — it gathers the input
 * and hands it to the detection service, which owns that ordering. Its job is
 * to turn whatever the form submitted into text, and whatever went wrong into a
 * message a person can act on.
 */

/** Hard ceiling regardless of plan, matching the Server Action body limit. */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export async function runScanAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const user = await requireUser(routes.aiDetector);

  let text = (formData.get("text") ?? "").toString();
  let source: ScanSource = "text";
  let filename: string | null = null;

  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;

  try {
    if (hasFile) {
      const entitlements = await getEntitlements(user.id);
      const planLimitBytes =
        (entitlements.plan?.maxFileSizeMb ?? 5) * 1024 * 1024;

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
          : "Paste some text or upload a document to analyse.",
        { code: "empty_input" },
      );
    }

    const title =
      (formData.get("title") ?? "").toString().trim() ||
      deriveTitle({ filename, text });

    // Keyed by content, so an accidental double submit of the same document
    // charges once. A genuine re-scan of the same text is rare enough that a
    // per-submission token would cost more than it saves.
    const idempotencyKey = `scan:${createHash("sha256")
      .update(`${user.id}:${text}`)
      .digest("hex")
      .slice(0, 48)}`;

    const { scanId } = await runDetectionScan({
      userId: user.id,
      text,
      title,
      source,
      filename,
      idempotencyKey,
    });

    revalidatePath(routes.aiDetector);
    redirect(`${routes.aiDetector}/${scanId}`);
  } catch (error) {
    // redirect() signals by throwing; let it through.
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }

    const appError = toAppError(error);
    return fail(appError.message, { code: appError.code });
  }
}

export async function deleteScanAction(
  scanId: string,
): Promise<ActionResult<null>> {
  await requireUser();

  const supabase = await createClient();
  // Scoped by RLS: a user can only ever delete their own scan.
  const { error } = await supabase.from("ai_scans").delete().eq("id", scanId);

  if (error) {
    console.error("[detection] failed to delete scan", error.message);
    return fail("We couldn't delete that scan. Please try again.");
  }

  revalidatePath(routes.aiDetector);
  return ok(null);
}
