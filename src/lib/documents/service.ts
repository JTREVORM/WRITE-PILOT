import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { recordUsage } from "@/lib/usage/service";
import { getEntitlements } from "@/lib/entitlements/service";
import { AppError, ERROR_CODES } from "@/lib/utils/errors";
import { countWords } from "@/lib/utils/format";
import { extractDocumentText } from "./extract";
import { deriveTitle, normalizeExtractedText } from "./text";
import { buildDocumentPath } from "./paths";
import {
  deleteDocumentFile,
  uploadDocumentFile,
} from "./storage";
import type { DocumentRow, ScanSource } from "@/types/database";

/**
 * Adding and removing documents.
 *
 * No credits change hands here — `document_upload` costs nothing — but the plan
 * still decides how many documents a user may keep and how large a file may be,
 * and both are enforced here rather than in the form. The form's copy of the
 * rule exists to explain a disabled button, not to be the rule.
 */

export const FEATURE_KEY = "document_upload";

/** Enough text to be a document rather than a stray paste. */
export const MIN_WORDS_FOR_DOCUMENT = 5;

export interface AddDocumentInput {
  userId: string;
  /** Either a file to extract and store, or text that was pasted. */
  file?: File | null;
  text?: string | null;
  title?: string | null;
}

export async function addDocument(
  input: AddDocumentInput,
): Promise<{ documentId: string }> {
  const entitlements = await getEntitlements(input.userId);
  const feature = entitlements.features[FEATURE_KEY];

  if (feature && !feature.enabled) {
    throw new AppError(
      ERROR_CODES.FEATURE_NOT_IN_PLAN,
      "Your plan doesn't include the document library.",
    );
  }

  const admin = createAdminClient();

  // The plan's document allowance is a standing limit on what is stored, not a
  // monthly one, so it is counted rather than read from a usage counter.
  const maxDocuments = entitlements.plan?.maxDocuments ?? null;
  if (maxDocuments !== null) {
    const { count } = await admin
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", input.userId);

    if ((count ?? 0) >= maxDocuments) {
      throw new AppError(
        ERROR_CODES.FEATURE_NOT_IN_PLAN,
        `Your plan keeps up to ${maxDocuments} documents. Delete one, or upgrade for more room.`,
      );
    }
  }

  let text: string;
  let source: ScanSource = "text";
  let filename: string | null = null;
  let bytes: Uint8Array | null = null;
  let contentType: string | null = null;

  if (input.file && input.file.size > 0) {
    const maxBytes = (entitlements.plan?.maxFileSizeMb ?? 5) * 1024 * 1024;
    const extracted = await extractDocumentText(input.file, { maxBytes });

    text = extracted.text;
    source = extracted.source;
    filename = extracted.filename;
    bytes = extracted.bytes;
    contentType = extracted.contentType;
  } else {
    text = normalizeExtractedText((input.text ?? "").toString());
  }

  const wordCount = countWords(text);

  if (wordCount < MIN_WORDS_FOR_DOCUMENT) {
    throw new AppError(
      ERROR_CODES.UNSUPPORTED_FILE,
      "There's no readable text in that. If it's a scan of a printed page, it has no text layer to extract.",
    );
  }

  const title =
    input.title?.trim().slice(0, 200) ||
    deriveTitle({ filename, text });

  const { data: document, error } = await admin
    .from("documents")
    .insert({
      user_id: input.userId,
      title,
      source,
      original_filename: filename,
      content_type: contentType,
      byte_size: bytes ? bytes.byteLength : null,
      content: text,
      word_count: wordCount,
      character_count: text.length,
    })
    .select("id")
    .single();

  if (error || !document) {
    console.error("[documents] failed to save document", error?.message);
    throw new AppError(ERROR_CODES.UNKNOWN);
  }

  // The file is stored under a path that includes the row's id, so the row has
  // to exist first. If storing the file fails the row goes with it: a document
  // that claims to have a file it cannot produce is worse than no document.
  if (bytes && contentType) {
    const path = buildDocumentPath({
      userId: input.userId,
      documentId: document.id,
      filename,
    });

    try {
      await uploadDocumentFile({
        path,
        userId: input.userId,
        bytes,
        contentType,
      });
    } catch (uploadError) {
      await admin.from("documents").delete().eq("id", document.id);
      throw uploadError;
    }

    const { error: pathError } = await admin
      .from("documents")
      .update({ storage_path: path })
      .eq("id", document.id);

    if (pathError) {
      console.error("[documents] failed to record storage path", pathError.message);
      await deleteDocumentFile({ path, userId: input.userId });
      await admin.from("documents").delete().eq("id", document.id);
      throw new AppError(ERROR_CODES.UNKNOWN);
    }
  }

  await recordUsage({
    userId: input.userId,
    featureKey: FEATURE_KEY,
    status: "success",
    words: wordCount,
    characters: text.length,
    referenceType: "document",
    referenceId: document.id,
    metadata: { source, stored_file: Boolean(bytes) },
  });

  return { documentId: document.id };
}

/**
 * Removes a document, its stored file, and nothing else.
 *
 * The analyses run on it keep their own copy of the text they read and are
 * deleted separately. That is stated on screen rather than left to be
 * discovered: a user deleting a document to remove their writing is entitled to
 * know what that does and does not reach.
 */
export async function removeDocument(params: {
  userId: string;
  documentId: string;
}): Promise<void> {
  const admin = createAdminClient();

  const { data: document } = await admin
    .from("documents")
    .select("id, user_id, storage_path")
    .eq("id", params.documentId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (!document) {
    throw new AppError(ERROR_CODES.NOT_AUTHORIZED, "That document couldn't be found.");
  }

  if (document.storage_path) {
    await deleteDocumentFile({
      path: document.storage_path,
      userId: params.userId,
    });
  }

  const { error } = await admin
    .from("documents")
    .delete()
    .eq("id", params.documentId)
    .eq("user_id", params.userId);

  if (error) {
    console.error("[documents] failed to delete document", error.message);
    throw new AppError(ERROR_CODES.UNKNOWN);
  }
}

/**
 * Loads a document's text for a tool run.
 *
 * Read through the service role and scoped to the caller by hand, the same way
 * the grader reads a rubric: a tool must never run against a document its
 * caller does not own.
 */
export async function getDocumentForTool(params: {
  userId: string;
  documentId: string;
}): Promise<Pick<DocumentRow, "id" | "title" | "content" | "source" | "original_filename">> {
  const admin = createAdminClient();

  const { data: document } = await admin
    .from("documents")
    .select("id, title, content, source, original_filename")
    .eq("id", params.documentId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (!document) {
    throw new AppError(ERROR_CODES.NOT_AUTHORIZED, "That document couldn't be found.");
  }

  return document;
}
